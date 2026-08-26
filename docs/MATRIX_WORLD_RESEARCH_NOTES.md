# Matrix / Agent World Research Notes

> **Status:** Working evidence log for the requested research-only decision. This document does **not** authorize or implement Matrix World.

## AgentSociety

The current public repository presents AgentSociety 2 as an LLM-native platform for social-science experimentation. Its documented components include modular environments, multiple reasoning patterns, Ray-task execution, experiment replay through catalogued JSONL records with DuckDB reads and distributed tracing, and MCP support. The repository separately describes its legacy line as a city-scale system with urban mobility, economy and social modules. It is Apache-2.0 licensed except for the separately named commercial folder. [AgentSociety repository](https://github.com/tsinghua-fib-lab/agentsociety)

What this establishes is a broad research orchestration and agent-simulation platform with explicit replay/tracing support. It does not, from the repository page alone, establish scientific provenance gates, deterministic replay across LLM calls, a verified Earthquake/digital-twin pipeline, or production customer adoption.

The AgentSociety v1 paper reports a research experiment with more than 10,000 agents and five million interactions, applying the framework to polarization, inflammatory-message spread, universal basic income, hurricane shocks and urban sustainability. This is the strongest published scale evidence located for AgentSociety, but it should be read as a paper-level experimental result rather than a general service-level guarantee or evidence of audited deterministic replay. [AgentSociety paper](https://arxiv.org/abs/2502.08691)

## OASIS

OASIS is an Apache-2.0 open-source simulator focused on social-media environments rather than an urban physical digital twin. Its repository claims configurable LLM/rule-based agent actions, mutable social-network/content environments, recommendation algorithms, persistent SQLite-backed runs, and simulations up to one million users. It also publishes a token-consumption reference, showing that LLM-driven scale has an explicit compute-cost dimension. [OASIS repository](https://github.com/camel-ai/oasis)

The available source supports comparison on large social interaction, agent action spaces, and platform dynamics. It does not establish deterministic evidence-grade replay, physical hazard simulation, City3D, or a multi-domain scientific evidence boundary.

The OASIS paper likewise frames its one-million-user figure as the simulator’s supported scale for digital social-media settings with dynamic networks, content, actions and recommendations. It reports studies of information spread, polarization and herd effects, rather than a city/physical-environment digital twin or calibrated resilience model. [OASIS paper](https://arxiv.org/abs/2411.11581)

## Generative Agents / Smallville

The Generative Agents paper describes an architecture of natural-language memory records, reflection, retrieval and planning; its public demonstration uses a 25-agent interactive town. The companion repository supports saved simulations and browser replay, but describes replay primarily as debugging/demonstration and warns of API-rate-limit and cost risks. [Paper](https://arxiv.org/abs/2304.03442) [Repository](https://github.com/joonspk-research/generative_agents)

This establishes the canonical small-world memory/goal/plan pattern for agent worlds. It does not establish a calibrated physical digital twin, scenario evidence packs, reproducible model-output verification, a commercial operating model, or large-scale deterministic replay.

## Simile — two distinct comparators

**Simulistics Simile** is a legacy scientific modelling environment, now described by its owner as free/open-source system-dynamics and object-based simulation software for earth, environmental and life sciences. Its documented strengths are continuous stock-and-flow dynamics, objects/individual-based modelling, discrete events, rule-driven variables, modular models and generated C++ execution. [Simulistics](https://www.simulistics.com/) [System Dynamics description](https://www.simulistics.com/tour/systemdynamics.htm)

It is a relevant comparator for visual scientific modelling and composable rules, but not evidence of memory-driven LLM agents, human decision modelling, a 3D digital twin, or provenance-gated replay.

**Simile (The Simulation Company)** is a newer, separate company built by researchers associated with Smallville. Bain Capital Ventures states that it is building an enterprise platform for human decision simulation using agents grounded in structured interviews, past choices and behavioral signals; the investor claims Fortune 100 usage, a CVS Health program with consented-response data, fivefold revenue growth in five months, and over $200 million in funding at a $2 billion valuation. These are investor statements, not independently audited performance or validation claims. [BCV investment note](https://baincapitalventures.com/insight/the-human-layer-of-ai-why-we-re-continuing-to-invest-in-simile/)

This is the strongest direct commercial evidence that agent-based human-decision simulation can be sold to enterprises. It is nevertheless materially different from Genesis’s current synthetic scientific/hazard demonstrator: its disclosed focus is customer and behavioral decision testing, not an auditable multi-hazard city digital twin.

## Established simulation and digital-twin platforms

**AnyLogic** documents a commercial simulation/digital-twin platform combining multimethod models, live IoT/ERP/SCADA connections, cloud deployment, API access, scenario experimentation, built-in 3D and an official NVIDIA Omniverse integration. It publishes industry examples across manufacturing, logistics, transportation, healthcare and urban infrastructure. This is strong evidence that simulation-backed digital twins, cloud/API delivery and systems-integration services have established commercial demand. It is not evidence that AnyLogic provides LLM memory/goal agents, evidence-grade `MATCH`/`DRIFT` replay, or one shared multi-hazard scientific contract. [AnyLogic Digital Twin](https://www.anylogic.com/features/digital-twin/)

**GAMA** is an open-source modelling and simulation environment centered on spatially explicit agent-based simulations. Its public site confirms active releases and points to its GitHub/documentation ecosystem. It is a credible spatial ABM comparator, but the available landing-page evidence does not establish LLM-agent memory, provenance gates, commercial cloud operations, or an integrated City3D/hazard evidence workflow. [GAMA Platform](https://gama-platform.org/)

**NVIDIA Omniverse** provides libraries and services for OpenUSD interoperability, RTX rendering, physics, sensor simulation, asset validation and industrial/physical-AI workflows. NVIDIA positions it as infrastructure that can be integrated into differentiated applications rather than a generic social-agent simulation product. It is therefore a potential future graphics/physical-simulation ecosystem comparator, but not a reason to replace Genesis City3D or add a second renderer. Its published digital-twin definition also underlines why Genesis must remain explicit that its current Earthquake demonstrator is synthetic and non-operational: industrial digital twins normally depend on physical-system data, model calibration and ongoing validation. [Omniverse](https://www.nvidia.com/en-us/omniverse/) [NVIDIA digital-twin glossary](https://www.nvidia.com/en-us/glossary/digital-twin/)

## UAE evidence

The Abu Dhabi Department of Municipalities and Transport officially launched its Abu Dhabi Digital Twin project in 2022. DMT describes a 3D/augmented-reality representation using aerial photography, LiDAR, game engines, spatial analysis, multiple government-system integrations, and continuously updated urban datasets; its stated users include planners, engineers and public/private-sector specialists. This is direct evidence of Abu Dhabi governmental demand for city-scale digital-twin decision support, but it is also evidence that a genuine operational twin depends on real spatial data and governance rather than a synthetic demonstration. [DMT announcement](https://www.dmt.gov.ae/en/Media-Centre/News/News_EN_AR_12_10_22)

Dubai RDI documents an awarded smart-digital-twin initiative for high-rise building management that combines AI, real-time IoT, 3D BIM, predictive maintenance, data integrity and AR/VR decision support. The project is expressly aligned to Smart Built Infrastructure and Cognitive Cities priorities and has a defined building pilot. This supports a research and partnership hypothesis for resilience/digital-twin work in Dubai; it does not establish that a new Genesis Matrix product has a buyer or that its current synthetic Earthquake slice is an operational city twin. [Dubai RDI SDT-HBM](https://dubairdi.ae/grant-initiatives-sdt-hbm-smart-digital-twin-platform-for-high-rise-building-management-in-dubai/)

## Digital humans and world foundation models

**Soul Machines** sells embodied enterprise AI assistants/digital workers, with a studio, workflow integration and paid product paths. Its public materials emphasize face-to-face interaction, agent embodiment and customer/HR/operations uses. This is commercial evidence for digital-human interfaces, but it is not an agent-based social world, scenario engine, physical digital twin, or deterministic/evidence replay system. [Soul Machines](https://www.soulmachines.com/)

**NVIDIA Cosmos** is a physical-AI world foundation model platform for video curation, world-model post-training, synthetic data generation and robotics/autonomous-system evaluation. Its paper and current product page frame it as a world-model/physical-AI platform, not as a social-agent simulator or city-resilience decision system. The important product distinction is that a generative world model can generate plausible futures but does not itself supply a transparent, deterministic, evidence-gated scientific simulation contract. [Cosmos](https://www.nvidia.com/en-us/ai/cosmos/) [Cosmos paper](https://arxiv.org/abs/2501.03575)

## Social digital twins and urban resilience literature

Peer-reviewed urban-digital-twin literature supports the conceptual relevance of combining agents, physical environments and resilience, but it also strongly cautions against equating a visual model with an operational twin. The human-centered UDT research agenda identifies a need for multi-agent interactions, AI and coupled natural–physical–social systems; it also details the data-integration, GIS/BIM/IoT, governance and validation burden required for a city-scale operational twin. [Human-centered UDT agenda](https://pmc.ncbi.nlm.nih.gov/articles/PMC10162701/)

The review of City Digital Twins for resilience likewise identifies priority hazards/users, data collection and management, model integration and usability as implementation challenges. This supports the value of the long-term Genesis direction, while rejecting a near-term claim that a synthetic City3D visualisation alone is a live city digital twin. [City digital twins for urban resilience](https://www.tandfonline.com/doi/full/10.1080/17538947.2023.2264827)

The 2026 Social Digital Twins preprint is a close research comparator: it proposes LLM cognitive agents with demographic/psychographic attributes, calibration against observables and counterfactual policy analysis. It remains a preprint and does not establish a mature commercial platform; it does show that the proposed category is actively researched and therefore cannot itself be Genesis’s moat. A defensible distinction would need to be evidence-grade deterministic replay, explicit provenance, validated domain solvers and clear non-operational boundaries where those inputs are absent. [Social Digital Twins preprint](https://arxiv.org/abs/2601.06111)
