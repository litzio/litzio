---
litzio: 1
title: Feature matrix
status: draft
numbering:
  headings: true
  figure: Fig. %s
template:
  name: Sample report
  description: Synthetic feature coverage
bibliography:
  - refs/sample.bib
---

(sec-intro)=

# Intro with $x^2$ and `code`

Text with {del}`removed **bold**`, H{sub}`2`O, x{sup}`*n*+1`, ***both***, a [titled link](https://example.org/a_(b) "Title text") and a [fragment](#sec-intro).

Literal colons: Note:see, 10:30, a :b and ratio 3:4, tilde ~one~ and ~~two~~ as text, pipes | and \*stars\*, under\_score, [brackets], #hash, \<angle>, &amp; entity, 50% done, `` code with ` tick ``, $a\$b$ and \$5.

Line one\
line two with trailing hard break before text.

See {ref}`sec-intro`, {numref}`fig-free`, {numref}`tab-fixed`, {eq}`A B` and {cite:t}`alpha,beta`, {cite:p}`gamma`.

:::{note}
:::

:::{attention}
Attention body.
:::

:::{caution}
Caution body.
:::

:::{danger}
Danger body.
:::

:::{error}
Error body.
:::

:::{hint}
Hint body.
:::

:::{important}
Important body.
:::

:::{seealso}
See also body.
:::

>

> Quote with *emphasis*.

***

{style=lower-alpha}
3) Third clause
4) Fourth clause

    {style=upper-roman}
    1. Nested roman

{style=lower-alpha}
1) Separate list

1. Decimal list

2) Decimal paren

*   [ ] open task
*   [x] done task
    *   [ ] nested task

Between lists.

*   Bullet after checklist
*
*   Third

```python
print("```")
```

````
plain ``` fence
````

```{math}
:label: A B

y = \frac{1}{2}
```

$$
$$ (eq-empty)

```{math}
:label: eq-fixed
:enumerator: 7a

z = 1
```

:::{figure} images/plot.png
:name: fig-free
:alt: Plot alt text
:enumerated: false

Free figure caption with {cite}`alpha`.
:::

:::{figure} images/fixed.png
:name: fig-fixed
:enumerator: 2b

Fixed figure.
:::

:::{figure}
:name: fig-pending
:::

:::{table} Fixed table with *mark*
:name: tab-fixed
:enumerator: T-1

| Left | Center | Right |
| :--- | :----: | ----: |
| a\|b | x<br>y | {eq}`A B` |
| `c` | $m$ | [^fn-a] |
:::

:::{table}
:enumerated: false

| H |
| - |
| v |

Note paragraph one.

Note with {ref}`sec-intro`.
:::

Footnote call[^fn-a] and[^Fn-B].

[^fn-a]: First note.

[^Fn-B]: Second note with $k$.
