---
litzio: 1
bibliography: [refs.bib]
---

# Reading references

Read this note[^detail] without leaving the paragraph.

Evidence {cite:p}`article,standard` supports this claim.

Missing {cite}`missing` and incomplete {cite}`unsupported` keep their status.

- The repeated note[^detail] and citation {cite}`article` work in lists.

| Context | Detail |
| --- | --- |
| Table | Note[^detail] and {cite}`standard` |

```{math}
:label: eq-example
x=1
```

See [the table](#tbl-small), {numref}`tbl-small`, [the figure](#fig-diagram), {numref}`fig-diagram`, [the equation](#eq-example), {eq}`eq-example`, [the method](#sec-method), {ref}`sec-method`, [the long table](#tbl-long), [the missing target](#missing) and {numref}`missing`.

:::{table} Small results
:label: tbl-small

| Signal | Value |
| --- | --- |
| Alpha | 1 |
:::

:::{figure} diagram.svg
:label: fig-diagram
:alt: Diagram

Signal flow caption.
:::

(sec-method)=

## Method

The method paragraph follows its heading.

## Results

:::{table} Long results
:label: tbl-long

| Row | Measurement | Wide detail | Remark |
| --- | --- | --- | --- |
| 1 | Measured value 1 | Additional wide detail column 1 | Further remark 1 |
| 2 | Measured value 2 | Additional wide detail column 2 | Further remark 2 |
| 3 | Measured value 3 | Additional wide detail column 3 | Further remark 3 |
| 4 | Measured value 4 | Additional wide detail column 4 | Further remark 4 |
| 5 | Measured value 5 | Additional wide detail column 5 | Further remark 5 |
| 6 | Measured value 6 | Additional wide detail column 6 | Further remark 6 |
| 7 | Measured value 7 | Additional wide detail column 7 | Further remark 7 |
| 8 | Measured value 8 | Additional wide detail column 8 | Further remark 8 |
| 9 | Measured value 9 | Additional wide detail column 9 | Further remark 9 |
| 10 | Measured value 10 | Additional wide detail column 10 | Further remark 10 |
| 11 | Measured value 11 | Additional wide detail column 11 | Further remark 11 |
| 12 | Measured value 12 | Additional wide detail column 12 | Further remark 12 |
| 13 | Measured value 13 | Additional wide detail column 13 | Further remark 13 |
| 14 | Measured value 14 | Additional wide detail column 14 | Further remark 14 |
| 15 | Measured value 15 | Additional wide detail column 15 | Further remark 15 |
| 16 | Measured value 16 | Additional wide detail column 16 | Further remark 16 |
:::

[^detail]: **Formatted** *endnote* with `code`, $x^2$, {eq}`eq-example`, {cite}`article` and [local diagram](https://github.com/litzio/litzio/blob/archive/2026-11-13-plugins-declarative/apps/editor/test/browser/fixtures/diagram.svg).
