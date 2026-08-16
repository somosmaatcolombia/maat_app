---
name: maat-biotipos
description: >
  Modelo de perfilación constitucional multidimensional de MAAT: identifica el biotipo
  biológico principal y el subdominante de una persona a partir de cuatro dimensiones
  (morfológica, fisiológica, psicológica y conductual), con raíz en la teoría hipocrática
  de los temperamentos. Úsalo SIEMPRE que trabajes en: el test/cuestionario de biotipos,
  interpretar el resultado de un mentee, redactar contenido de biotipos (app, correo,
  informes), diseñar preguntas del test, entrenar/calibrar el modelo, o integrar el biotipo
  dentro del acompañamiento de las 16 semanas. Actívalo aunque el usuario no diga "biotipo"
  explícitamente: si habla de temperamentos, humores, perfilación, sanguíneo/colérico/
  melancólico/flemático, somatotipo, constitución, o "qué tipo de persona es este cliente",
  esta skill aplica.
---

# MAAT — Biotipos (perfilación constitucional multidimensional)

## Qué es este modelo

Un sistema para leer la **constitución** de una persona en cuatro biotipos, con raíz en la
teoría hipocrática de los cuatro humores (ver `references/fundamento-hipocratico.md`). No es
un test de personalidad de una sola capa: cruza **cuatro dimensiones de observación** para
que el perfil sea biológico y no solo psicológico.

| Biotipo | Humor | Cualidades | Elemento | Esencia | Color MAAT |
|---|---|---|---|---|---|
| Sanguíneo | Sangre | Caliente + húmedo | Aire | Conexión, entusiasmo | naranja `--o` |
| Colérico | Bilis amarilla | Caliente + seco | Fuego | Voluntad, dirección | coral `--r` |
| Melancólico | Bilis negra | Frío + seco | Tierra | Profundidad, sentido | púrpura `--v` |
| Flemático | Flema | Frío + húmedo | Agua | Calma, constancia | azul `--c` |

Cada persona tiene los cuatro; lo que varía es la **mezcla (krâsis)**. El resultado es un
**biotipo principal + un subdominante**, más un espectro de los cuatro. Nadie es "puro".

## Principio rector: equilibrio, no etiqueta

Para Hipócrates la salud es **isonomía** (equilibrio de los humores) y el desequilibrio es
el predominio (monarquía) de uno. Traducido a MAAT: **el biotipo nombra una tendencia a
reequilibrar, no una jaula.** El trabajo de la mentoría no es "corregir" el tipo, sino llevar
al dominante de vuelta hacia el centro, apoyándose en sus fortalezas.

**Esto NO es un diagnóstico clínico ni psicológico.** Es un espejo de autoconocimiento. Nunca
uses el modelo para afirmar enfermedad, prescribir tratamiento, ni sustituir a un profesional
de salud. Si en la lectura aparecen señales de salud física o mental que preocupan, deriva.

## Las cuatro dimensiones

El perfil se arma cruzando cuatro lentes. Detalle completo (matriz 4×4) en
`references/modelo-multidimensional.md`.

1. **Morfológica** — constitución física: complexión, tono, rostro, piel, postura, calidad del
   movimiento. (Somatotipo aproximado: ecto/meso/endo + rasgos humorales.)
2. **Fisiológica** — funcionamiento del cuerpo: patrón de energía, sueño, digestión,
   termorregulación (calor/frío), hidratación/retención, ritmo, dónde somatiza el estrés.
3. **Psicológica** — vida interior: emoción base y reactividad, estilo cognitivo, atención,
   fuente de motivación, miedo y deseo nucleares.
4. **Conductual** — comportamiento observable: cómo decide, se relaciona, comunica, forma
   hábitos, trabaja y responde al estrés.

Las dimensiones morfológica y fisiológica son las que vuelven el modelo **biológico** (no solo
un test de rasgos). Parte de sus ítems son autorreporte; otros son de **observación del mentor**.

## Cómo se aplica el test

Banco completo de preguntas en `references/banco-preguntas.md` (organizado por dimensión, con
marca de autorreporte vs. observación).

1. **Responder** los ítems por dimensión (escala 1–5). Cada ítem suma a un biotipo (s/c/m/f).
2. **Puntuar** por dimensión y luego agregar. Recomendación de ponderación por defecto:
   psicológica 30% · conductual 30% · fisiológica 25% · morfológica 15% (la morfología orienta
   pero pesa menos, porque es la más ruidosa de autorreportar). Ajustable.
3. **Normalizar** a % por biotipo y **rankear**: principal = el más alto; subdominante = el 2º.
4. **Marcar krâsis (mezcla)** si principal y subdominante quedan a ≤10 puntos: se leen como uno.
5. **Reportar el espectro completo** de los cuatro, no solo los dos primeros.

> El cuestionario público bilingüe vive en `src/maat_biotipo.html` (proyecto MAAT). Al ampliar
> el modelo, mantén esa app como la implementación de referencia y estos documentos como la
> fuente de verdad del contenido.

## Cómo explicar el resultado a un mentee

- **Empieza por la fortaleza**, no por la sombra. El biotipo primero valida quién es la persona.
- **Nombra la tendencia, no el destino.** "Tiendes a…", no "eres incapaz de…".
- **Conecta con lo somático.** Que reconozca su patrón en el cuerpo (energía, sueño, tensión):
  eso vuelve el insight tangible y creíble.
- **Cierra con el reequilibrio**, no con la carencia: qué práctica lo devuelve al centro.
- Evita determinismo, jerga clínica y comparaciones de valor entre biotipos (ninguno es "mejor").

## Cómo se integra en las 16 semanas

Cada biotipo transita distinto las 4 fases MAAT (Gratitud, Amor, Intención, Voluntad) y tiene
un "hábito ancla" que lo reequilibra. El playbook por biotipo × fase, con señales de alerta y
lenguaje sugerido para el mentor, está en `references/integracion-mentoria.md`.

## Entrenar y calibrar el modelo

"Entrenar" aquí no es machine learning: es **calibrar la correspondencia ítem→biotipo** con
casos reales. Flujo sugerido:

1. Aplica el test a mentees cuyo biotipo el mentor ya intuye bien (casos "ancla").
2. Revisa dónde el puntaje discrepa de la intuición clínica del mentor y por qué.
3. Ajusta pesos de ítems o reescribe los que discriminan mal (los que casi todos responden igual
   no aportan). Documenta el cambio en `references/banco-preguntas.md`.
4. Repite. La meta es que el test coincida con la lectura experta del mentor, y que sea legible
   y accionable para el mentee.

## Archivos de referencia

- `references/fundamento-hipocratico.md` — la raíz humoral (humores, cualidades, estaciones,
  equilibrio/krâsis) citando *Sobre la naturaleza del hombre*; y los límites éticos del modelo.
- `references/modelo-multidimensional.md` — la matriz 4×4 (biotipos × dimensiones) con descriptores.
- `references/banco-preguntas.md` — el test ampliado por dimensión (autorreporte + observación).
- `references/integracion-mentoria.md` — recorrido por biotipo en las 4 fases + playbook del mentor.
