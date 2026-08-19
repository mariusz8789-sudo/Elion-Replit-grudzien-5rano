# Genesis — Quantum Evidence Card (Q0)

## Cel

Quantum Evidence Card jest małą, niemutującą warstwą wyjaśniającą dla prośby o Majorana 1, topologiczne kubity albo „nowy stan materii”. Jej zadaniem jest pokazać użytkownikowi **co jest pomiarem recenzowanym, co pozostaje claimem pod dalszą oceną, a co jest fikcyjną analogią** zanim użytkownik potwierdzi eksperyment.

Nie jest solverem, wynikiem eksperymentu, drugim Knowledge Registry ani drugim stanem świata.

## Trzy statusy karty

| Status karty | Rekord wiedzy | Sens |
|---|---|---|
| `PEER_REVIEWED_MEASUREMENT` | Pomiar parzystości InAs–Al opisany w Nature (2025). | Fakt o zakresie konkretnego badania; nie rozstrzyga jednoznacznie obecności MZM. |
| `CLAIM_UNDER_REVIEW` | Claim topologicznego kubitu / Majorana 1. | Hipoteza / claim technologiczny wymagający dalszej niezależnej weryfikacji. |
| `FICTIONAL_REFERENCE` | Odniesienie do *Avengers: Endgame* użyte przez reel. | Inspiracja narracyjna; nie jest parametrem ani dowodem fizycznym. |

## Inwarianty

1. Karta wyłącznie referuje źródłowe rekordy Supplemental Knowledge Registry przez `knowledgeId`.
2. Karta nie zmienia `KnowledgeCapability`, `runnable`, `engine`, `requiredSolver`, modelu ani parametrów planu.
3. Karta nie może przekształcić `quantum-bloch`, `chsh-correlation` ani żadnego innego modelu w „symulację Majorana 1”.
4. Claim nie może zostać zaklasyfikowany jako fakt tylko dlatego, że pochodzi z instytucjonalnego komunikatu.
5. Referencja fikcyjna nie może stać się źródłem obserwowalnej, scenariusza modelu lub Evidence Pack.
6. Plan dla `quantum-schrodinger` bez zatwierdzonego runtime nadal otrzymuje `ENGINE_NOT_AVAILABLE`.

## Integracja z Evidence-Guided Plan

`planEvidenceGuidedExperiment()` pozostaje jedynym publicznym preflightem. Jeśli `intent.knowledgeSources` zawiera rekordy Majorana, plan dostaje pole `quantumEvidenceCards` z deterministyczną kartą. Potwierdzenie wciąż następuje wyłącznie dla canonicalnego, `READY_FOR_CONFIRMATION` planu; karta nie jest wejściem do executora.

```text
sourceText → Supplemental Knowledge search
  → canonical router intent / knowledgeSources
  → Quantum Evidence Card (read-only view)
  → Evidence-Guided Plan disclosure
  → [potwierdzenie tylko jeśli realny model jest dostępny]
```

## Dowód testowy

Test musi potwierdzić, że prośba związana z Majorana tworzy kartę o trzech statusach, że `quantum-bloch` nadal oznacza własny ograniczony model, a prośba wymagająca `quantum-schrodinger` nadal nie może zostać potwierdzona bez silnika.

## Źródła

[1]: https://www.nature.com/articles/s41586-024-08445-2 "Interferometric single-shot parity measurement in InAs–Al hybrid devices, Nature (2025)"
[2]: https://link.aps.org/doi/10.1103/Physics.18.57 "APS — Experts Weigh in on Microsoft’s Topological Qubit Claim"
[3]: https://link.aps.org/doi/10.1103/Physics.18.68 "APS — Microsoft’s Claim of a Topological Qubit Faces Tough Questions"
[4]: /home/ubuntu/genesis_delivery/GENESIS_MAJORANA_AND_QUANTUM_SIMULATION_RESEARCH.md "Research Genesis"
