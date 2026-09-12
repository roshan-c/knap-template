# Local-First Markdown Publishing with Knap and Pandoc

## Abstract

This report describes a small, local, source-first Markdown publishing
pipeline. The manuscript lives in a single ordinary Markdown file while
metadata, pipeline facts, and bibliographic data live in a companion JSON
file. Knap templates generate the YAML front matter and the reference
inventory at build time, and Pandoc converts the assembled document to HTML
and PDF with citation processing. The writing workflow stays in a plain text
editor; no web editor or remote service is required.

## Introduction

The pipeline is intentionally small. You write in `report.md`, keep data in
`project.json`, and run npm scripts. Knap renders templates such as the
Showdown-style filter `sort` and the `yaml_property` filter, which emits
Pandoc-ready YAML metadata for citations.

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

<!-- GENERATED_REFERENCE_INVENTORY -->