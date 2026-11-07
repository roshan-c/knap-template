## Introduction

The pipeline is intentionally small. You write in `report.md`, keep data in
`project.json`, and run npm scripts. Knap's built-in `sort` filter orders
reference records by ID, `yaml_property` serializes named YAML properties,
and `table` turns the pipeline records into a Markdown table. The title and
abstract come from metadata. References contains the citeproc bibliography;
the appendix holds the generated citation-key inventory and pipeline table.

## A small math example

Inline math such as $E = mc^2$ and display math such as

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

both use LaTeX-style Markdown math, which Pandoc understands natively.

## Citations

This pipeline relies on two documented tools: Knap for template-driven
Markdown generation [@knap] and Pandoc for document conversion and citation
processing [@pandoc]. Both are cited together in this paragraph, using
Pandoc's bracket syntax with a semicolon separator [@knap; @pandoc]. Pandoc
resolves these keys against the `references` field in the generated YAML
front matter, so the published output shows formatted citations and a
bibliography instead of unresolved bracket syntax.

## References

::: {#refs}
:::

## Appendix: Build pipeline

<!-- GENERATED_BUILD_APPENDIX -->
