# Proyectos de ejemplo por stack

Proyectos mínimos (código, pruebas y cobertura) que el CI usa para probar **de verdad** la fábrica en otros stacks: el job `stacks` copia cada uno, le instala la fábrica con el instalador (modo proyecto existente), corre `./factory onboard check` (instalar, compilar, probar, medir cobertura) y luego `./factory gates`.

| Carpeta | Stack | Cobertura |
|---|---|---|
| `python` | Python + pytest | pytest-cov (Cobertura XML) |
| `dotnet` | .NET 8 + xUnit | coverlet (Cobertura XML) |
| `maven` | Java 21 + Maven + JUnit 5 | JaCoCo |
| `gradle` | Java 21 + Gradle + JUnit 5 | JaCoCo |

Local: `examples/stacks/e2e.sh python` (necesita el toolchain del stack instalado). No forman parte del kit: el instalador no los copia.
