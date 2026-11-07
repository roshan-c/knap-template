---
title: Invisible title words
abstract: Abstract words excluded
wordLimit: 15
references:
  - id: knap
    type: book
    author:
      - literal: Knap
    title: Hidden bibliography title
    issued:
      date-parts: [[2026]]
---
## Body

These four words count.

Inline $x+y$ and `hidden code`.

## Our *References* Model

See @fig:x and [@knap].

![Invisible figure caption](example.svg){#fig:x}

| Hidden | table |
|---|---|
| Cells | excluded |

: Invisible table caption {#tbl:x}

``` {#lst:code caption="Invisible listing caption"}
ignored code words
```

$$x=y$$ {#eq:x}

## References

Excluded bibliography prose.

::: {#refs}
More excluded words.
:::

## Appendix

Excluded appendix prose.

### Details

Also excluded.
