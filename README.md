# K6 Performance Testing — Proyecto práctico
 
Stack reproducible de pruebas de rendimiento con [Grafana k6](https://k6.io/) sobre un sistema bajo prueba propio (FastAPI en Docker), con observabilidad en tiempo real vía Prometheus + Grafana y reportes HTML/JSON/Markdown.
 
Cubre las cuatro pruebas canónicas (smoke, load, stress, spike) más escenarios parametrizados y de tráfico mixto simultáneo.
 
---
 
## Requisitos previos
 
| Herramienta | Versión probada | Notas |
|-------------|-----------------|-------|
| WSL2 Ubuntu | 22.04 LTS | Kernel 5.15+ |
| Docker Desktop | 25.0.3 | Con integración WSL2 activada |
| Docker Compose | v2.24.6 | Incluido con Docker Desktop |
| k6 | v1.7.1 | Binario nativo vía apt |
| jq | 1.6+ | Para post-procesado de resultados |
| curl | 7.81+ | Para descargar dashboards |
 
Sistema operativo de referencia: Windows 11 + WSL2. Funcionará en Linux puro sin cambios.
 
---
 
## Estructura del proyecto
 
```
k6-learning/
├── docker-compose.yml              # SUT + Prometheus + Grafana
├── sut/                            # Sistema bajo prueba (FastAPI)
│   ├── Dockerfile
│   ├── app.py                      # /fast /slow /cpu /echo /health
│   └── requirements.txt
├── prometheus/
│   └── prometheus.yml
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/prometheus.yml
│   │   └── dashboards/k6.yml
│   └── dashboards/
│       └── k6-prometheus.json      # Dashboard ID 19665
├── scripts/
│   ├── hello.js                    # Primer smoke mínimo
│   ├── lib/
│   │   ├── summary.js              # handleSummary (JSON + HTML + stdout)
│   │   └── dataset.js              # SharedArray helpers
│   ├── build-results-table.sh      # Genera tabla Markdown para informe
│   └── dump-metrics.sh             # Vuelca KPIs por test
├── tests/
│   ├── smoke/
│   │   ├── anatomy.js              # Script didáctico (todos los bloques)
│   │   └── smoke.js
│   ├── load/
│   │   ├── load.js
│   │   └── load-parametrized.js    # Datos desde CSV/JSON con SharedArray
│   ├── stress/
│   │   └── stress.js
│   ├── spike/
│   │   └── spike.js
│   └── scenarios/
│       └── mixed.js                # Dos scenarios en paralelo
├── data/
│   ├── users.csv                   # 50 usuarios
│   └── payloads.json               # 20 mensajes variados
├── results/
│   ├── json/                       # summaries por test
│   └── html/                       # reportes k6-reporter
└── docs/
    ├── dificultades.md             # Hallazgos documentados
    ├── tabla-resultados.md         # KPIs consolidados
    └── metricas-completas.txt
```
 
---
 
## Instalación paso a paso
 
Todo se ejecuta desde **WSL2 Ubuntu** (bash), no desde PowerShell.
 
### 1. Clonar el proyecto
 
```bash
cd ~
git clone <url-del-repo> k6-learning
cd k6-learning
```
 
### 2. Verificar Docker
 
```bash
docker --version
docker compose version
docker ps
```
 
Si Docker no responde, abre Docker Desktop en Windows → Settings → Resources → WSL Integration y activa tu distro Ubuntu.
 
### 3. Instalar k6 (binario nativo)
 
```bash
sudo apt-get update
sudo apt-get install -y gnupg ca-certificates curl jq
sudo gpg -k
sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install -y k6
k6 version
```
 
Fallback si el keyserver falla (típico tras VPN):
 
```bash
curl -fsSL https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6-archive-keyring.gpg
sudo apt-get update && sudo apt-get install -y k6
```
 
### 4. Descargar el dashboard de Grafana (si no viene con el repo)
 
```bash
mkdir -p grafana/dashboards
curl -sL -H "User-Agent: Mozilla/5.0" \
  "https://grafana.com/api/dashboards/19665/revisions/latest/download" \
  -o grafana/dashboards/k6-prometheus.json
sed -i 's/\${DS_PROMETHEUS}/Prometheus/g' grafana/dashboards/k6-prometheus.json
```
 
---
 
## Variables de entorno soportadas
 
| Variable | Default | Usada por |
|----------|---------|-----------|
| `BASE_URL` | `http://localhost:8000` | Todos los scripts k6 |
| `K6_PROMETHEUS_RW_SERVER_URL` | (sin default) | k6 cuando se usa remote-write |
| `K6_PROMETHEUS_RW_TREND_STATS` | `p(99),p(95),min,max` | Percentiles a exportar a Prometheus |
| `K6_PROMETHEUS_RW_PUSH_INTERVAL` | `5s` | Intervalo de push k6 → Prometheus |
 
---
 
## Despliegue
 
Levantar el stack completo (SUT + Prometheus + Grafana):
 
```bash
docker compose up -d --build
sleep 15
docker compose ps
```
 
Debe mostrar 3 servicios:
 
| Servicio | Contenedor | Puerto host | Estado esperado |
|----------|------------|-------------|-----------------|
| sut | k6-sut | 8000 | running (healthy) |
| prometheus | k6-prometheus | 9090 | running |
| grafana | k6-grafana | 3000 | running |
 
Verificaciones de sanidad:
 
```bash
curl -s http://localhost:8000/health
curl -sI http://localhost:9090/-/ready
curl -sI http://localhost:3000/api/health
```
 
Accesos:
 
- **SUT**: http://localhost:8000 (endpoints: `/fast`, `/slow?ms=N`, `/cpu?rounds=N`, `/echo`, `/health`)
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (login anónimo con rol Admin)
 
Detener:
 
```bash
docker compose down              # conserva volúmenes
docker compose down -v           # limpia datos de Prometheus/Grafana
```
 
---
 
## Ejecución de las pruebas
 
Las rutas asumen que estás en la raíz del repo.
 
### Smoke test
 
Valida que el sistema y la infraestructura funcionan bajo carga mínima.
 
```bash
k6 run tests/smoke/smoke.js
```
 
Duración: ~1 minuto. 2 VUs constantes. Thresholds estrictos (0% errores, p(95) < 300ms).
 
### Load test
 
Carga normal esperada sostenida.
 
```bash
k6 run tests/load/load.js
```
 
Duración: ~3 minutos. Escalones: 0 → 10 VUs → meseta → 0. Mezcla de `/fast`, `/cpu?rounds=3000` y `/echo`.
 
### Stress test
 
Buscar el punto de quiebre del SUT.
 
```bash
k6 run tests/stress/stress.js
```
 
Duración: ~4 minutos. Escalones hasta 50 VUs con `/cpu?rounds=8000` dominante. Se espera que al menos un threshold falle (exit code 99): así se evidencia el techo del SUT.
 
### Spike test
 
Subida y bajada brusca. Lo crítico es observar la recuperación.
 
```bash
k6 run tests/spike/spike.js
```
 
Duración: ~2 minutos. Rampa 2 → 60 → 2 VUs en segundos.
 
### Load parametrizado
 
Usa 50 usuarios distintos desde `data/users.csv` y 20 payloads desde `data/payloads.json` vía SharedArray.
 
```bash
k6 run tests/load/load-parametrized.js
```
 
### Escenarios múltiples simultáneos
 
Dos patrones corriendo en paralelo: lectores VU-based y escritores arrival-rate-based.
 
```bash
k6 run tests/scenarios/mixed.js
```
 
### Ejecución con observabilidad en Grafana
 
Cualquier test puede redirigir métricas a Prometheus para visualizarlas en vivo:
 
```bash
export K6_PROMETHEUS_RW_SERVER_URL=http://localhost:9090/api/v1/write
export K6_PROMETHEUS_RW_TREND_STATS="p(95),p(99),min,max,avg"
export K6_PROMETHEUS_RW_PUSH_INTERVAL=5s
 
k6 run --out experimental-prometheus-rw tests/spike/spike.js
```
 
Abre http://localhost:3000 → Dashboards → k6 Prometheus, y elige el `testid` correspondiente al run.
 
### Apuntar a un SUT remoto
 
```bash
BASE_URL=https://mi-sut.example.com k6 run tests/load/load.js
```
 
---
 
## Reportes
 
Cada ejecución produce tres salidas vía `handleSummary`:
 
- `results/json/<test>.json` — summary completo (parseable por `jq`).
- `results/html/<test>.html` — reporte visual autónomo ([k6-reporter](https://github.com/benc-uk/k6-reporter)).
- **stdout** — el summary textual nativo con colores.
 
Abrir un HTML desde WSL2:
 
```bash
explorer.exe "$(wslpath -w $(pwd)/results/html/stress.html)"
```
 
### Generar tabla consolidada para informes
 
Tras ejecutar las pruebas:
 
```bash
./scripts/build-results-table.sh > docs/tabla-resultados.md
./scripts/dump-metrics.sh        > docs/metricas-completas.txt
```
 
---
 
## Resultados medidos (ejemplo de ejecución local)
 
| Prueba | Duración | Iter. | RPS | p(95) ms | p(99) ms | Errores | Checks | Exit |
|--------|----------|-------|-----|----------|----------|---------|--------|------|
| smoke | 60 s | ~60 | ~1 | <10 | <20 | 0% | 100% | 0 |
| load | 180 s | ~3000 | ~15 | <300 | <500 | 0% | 100% | 0 |
| stress | 240 s | ~6000 | ~30 | >1000 | >2000 | >2% | <98% | 99 |
| spike | 135 s | ~1500 | variable | picos >800 | picos >1500 | <5% | >95% | 0 |
 
Valores concretos: ver `docs/tabla-resultados.md` y `docs/metricas-completas.txt`.
 
---
 
## Troubleshooting
 
### `duplicate bounded name check` al cargar un script
 
**Causa**: heredoc duplicado al generar el archivo (el `cat > ... << 'EOF'` se ejecutó dos veces o el paste quedó partido).
 
**Solución**: verificar con `grep -c "^import" <archivo>` (debe dar el número exacto esperado). Rehacer el archivo con `rm` + nuevo heredoc si hay duplicados.
 
### Prometheus en Restarting loop con `yaml: line N: did not find expected key`
 
**Causa**: caracteres acentuados (ñ, í, é) en `prometheus.yml` quedaron codificados como bytes no-UTF8 al pasar por el heredoc.
 
**Solución**: reescribir `prometheus.yml` con contenido ASCII puro (sin comentarios en español con tildes). `docker compose restart prometheus`.
 
### Grafana: `dial tcp: lookup prometheus on 127.0.0.11:53: no such host`
 
**Causa**: los contenedores quedaron en redes Docker distintas tras cambiar el `docker-compose.yml`.
 
**Solución**:
 
```bash
docker compose down --remove-orphans
docker compose up -d --build
```
 
### `--out influxdb=...` no existe
 
K6 removió el output nativo de InfluxDB v1 en la v0.47 (oct-2023). Este proyecto usa Prometheus remote-write, que es el reemplazo recomendado y está incluido nativamente en k6 1.x.
 
### Dashboard de Grafana vacío aunque k6 está corriendo
 
Verifica que el selector `testid` en la parte superior del dashboard apunte al run actual. Los dashboards de k6 filtran por `testid` y las ejecuciones pasadas siguen visibles.
 
Verificación manual de métricas en Prometheus:
 
```bash
curl -s 'http://localhost:9090/api/v1/query?query=k6_http_reqs_total' | jq '.data.result | length'
```
 
Si devuelve 0, k6 no está pushando. Revisar el nombre del output flag con `k6 run --out help`.
 
### Port collision al levantar el stack
 
Si 8000, 9090 o 3000 están ocupados:
 
```bash
ss -ltnp | grep -E ':(3000|8000|9090) '
```
 
Cambia los mapeos en `docker-compose.yml` (por ejemplo `"8001:8000"`).
 
---
 
## Limitaciones conocidas
 
- El SUT corre con 1 worker de Uvicorn a propósito para que el stress test muestre saturación real con pocos VUs. En producción se usaría `--workers $(nproc)`.
- Los tests asumen que el SUT está en `localhost:8000`. Para SUTs remotos, exporta `BASE_URL`.
- El dashboard de Grafana ID 19665 es una versión comunitaria; si Grafana Labs la actualiza, algún panel podría requerir ajuste del selector de variables.
- No hay CI configurado. Para integrar en un pipeline, cada `k6 run` devuelve exit 99 si algún threshold falla — eso permite gatear el build.
- El stack está pensado para un generador de carga local. Para cargas distribuidas (>500 VUs sostenidos), considerar k6 Cloud o múltiples agentes remotos orquestados.
 
---
 
## Referencias
 
- Documentación oficial de k6: https://grafana.com/docs/k6/latest/
- k6 Prometheus remote-write output: https://grafana.com/docs/k6/latest/results-output/real-time/prometheus-remote-write/
- Dashboard Grafana ID 19665 (k6 Prometheus): https://grafana.com/grafana/dashboards/19665/
- k6-reporter (HTML): https://github.com/benc-uk/k6-reporter
- Patterns y mejores prácticas: https://grafana.com/docs/k6/latest/testing-guides/
 
---
 
## Licencia
 
MIT. Ver `LICENSE`.
