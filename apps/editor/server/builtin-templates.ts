/** Read-only app resources: ordinary native Markdown, bundled in every Host/CLI. */
export const BUILTIN_TEMPLATES = {
  "ai-report": {
    ko: `---
litzio: 1
title: AI 작업 보고서
template:
  name: AI 작업 보고서
  description: 작업 목적, 변경 내용, 검증 결과와 남은 작업을 기록합니다.
---

## 작업 목적

## 변경 내용

## 검증 결과

## 남은 작업
`,
    en: `---
litzio: 1
title: AI work report
template:
  name: AI work report
  description: Record the goal, changes, verification results and remaining work.
---

## Goal

## Changes

## Verification results

## Remaining work
`,
  },
  "technical-document": {
    ko: `---
litzio: 1
title: 기술 문서
template:
  name: 기술 문서
  description: 개요, 요구사항, 설계와 검증 방법을 정리합니다.
---

## 개요

## 요구사항

## 설계

## 검증 방법
`,
    en: `---
litzio: 1
title: Technical document
template:
  name: Technical document
  description: Describe the overview, requirements, design and verification approach.
---

## Overview

## Requirements

## Design

## Verification approach
`,
  },
} as const;
