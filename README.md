<div align="center">

# 🚀 VISION ASTRA

### AI-POWERED TERRESTRIAL ANALOG DISCOVERY FOR LUNAR & MARTIAN EXPLORATION

**Bridging Earth to the Future of Space Exploration.**

[![Project](https://img.shields.io/badge/Project-VISION%20ASTRA-0A84FF)]()
[![Challenge](https://img.shields.io/badge/NASA-Space%20Apps%202026-FF6B35)]()
[![Status](https://img.shields.io/badge/Status-Prototype-success)]()
[![Domain](https://img.shields.io/badge/Domain-Space%20Science-purple)]()

**DISCOVER → COMPARE → PREPARE**

</div>

---

## 📑 Table of Contents

1. [Project Overview](#-project-overview)
2. [Problem Statement](#-problem-statement)
3. [Our Solution](#-our-solution)
4. [Key Features](#-key-features)
5. [Technology Stack](#-technology-stack)
6. [System Architecture](#-system-architecture)
7. [Project Workflow](#-project-workflow)
8. [Similarity Calculation](#-similarity-calculation)
9. [Scientific Data Sources](#-scientific-data-sources)
10. [Installation & Setup](#-installation--setup)
11. [Project Structure](#-project-structure)
12. [Development Roadmap](#-development-roadmap)
13. [Scientific Limitations](#-scientific-limitations)
14. [Team Members](#-team-members)
15. [Acknowledgements](#-acknowledgements)

---

## 🌌 Project Overview

**VISION ASTRA** is an interactive planetary analogue discovery platform designed to identify and compare Earth's extreme environments with selected regions of the Moon and Mars.

The platform explores how terrestrial environments can support planetary research, technology testing, geological studies, robotic experiments and future human exploration missions.

By combining planetary exploration, geospatial visualization and parameter-based environmental comparison, VISION ASTRA aims to create a bridge between Earth's natural laboratories and humanity's future exploration of other worlds.

### Mission

To discover Earth's most scientifically relevant environmental analogues and support research for future lunar and Martian exploration.

---

## 🎯 Problem Statement

Preparing for exploration beyond Earth presents several challenges:

- Conducting experiments directly on the Moon and Mars is expensive.
- Planetary environments have unique geological and environmental characteristics.
- Researchers need suitable terrestrial environments to test instruments and technologies.
- Visual similarities alone cannot establish scientific equivalence.
- Comparing planetary and terrestrial datasets requires multiple environmental parameters.

**The challenge:** How can we identify Earth's environments that provide useful partial analogues for lunar and Martian exploration?

---

## 💡 Our Solution

VISION ASTRA provides an interactive discovery and comparison workflow.

Users can:

1. Select a planetary target.
2. Explore its geographical region.
3. Choose environmental comparison parameters.
4. Discover potential Earth analogue locations.
5. Compare environmental characteristics.
6. Explore similarity rankings.
7. Understand similarities, differences and potential research applications.

Our goal is not to claim that Earth can perfectly reproduce another planetary environment, but to identify where meaningful scientific comparisons can be made.

---

## 🚀 Key Features

| Feature | Description |
|---|---|
| 🪐 Planetary Explorer | Explore selected lunar and Martian regions. |
| 🌍 Earth Analogue Discovery | Explore potential terrestrial analogue environments. |
| 📊 Similarity Analysis | Compare environmental parameters using weighted scoring. |
| 🌐 Interactive 3D Globe | Visualize terrestrial analogue locations. |
| 🔬 Scientific Comparison | Examine similarities and environmental differences. |
| 📄 Report Generator | Generate downloadable text-based research reports. |
| 🛰️ Mission Preparation | Explore potential applications for planetary research. |

### Supported Comparison Parameters

- Temperature
- Terrain slope
- Elevation
- Surface materials
- Ice and water indicators
- Volcanic geology
- Impact features
- Aridity

---

## 🛠️ Technology Stack

### Current Implementation

| Technology | Application |
|---|---|
| HTML5 | Frontend structure |
| CSS3 | Styling, animations and responsive layouts |
| JavaScript ES6+ | Application logic and interactions |
| globe.gl | Interactive 3D Earth visualization |
| Google Fonts | Typography |
| Canvas API | Animated background effects |
| Web Storage API | Browser-based demonstration storage |

### Planned Technologies

| Technology | Intended Application |
|---|---|
| Python | Scientific data processing |
| FastAPI | Backend API |
| NumPy | Numerical computation |
| Pandas | Data analysis |
| GeoPandas | Geospatial processing |
| Rasterio / GDAL | Satellite and raster data |
| Scikit-learn | Similarity analysis |
| PostgreSQL / PostGIS | Geospatial database |
| MapLibre / Leaflet | Interactive GIS visualization |

*Planned technologies are not represented as completed integrations.*

---

## 🏗️ System Architecture

### Current Prototype

```text
             VISION ASTRA
                  |
                  v
            FRONTEND LAYER
                  |
          +-------+-------+
          |               |
          v               v
      HTML / CSS      JAVASCRIPT
                          |
              +-----------+-----------+
              |           |           |
              v           v           v
           PLANETARY   SIMILARITY   3D GLOBE
           EXPLORER    ANALYSIS     VISUALIZATION
              |           |           |
              +-----------+-----------+
                          |
                          v
                 REPORT GENERATION
```

### Proposed Future Architecture

```text
                USER INTERFACE
                       |
                       v
                REACT / NEXT.JS
                       |
                       v
                  FASTAPI
                       |
           +-----------+-----------+
           |                       |
           v                       v
     DATA PROCESSING         GIS PROCESSING
           |                       |
           v                       v
     SIMILARITY ENGINE       SPATIAL ANALYSIS
           |                       |
           +-----------+-----------+
                       |
                       v
                POSTGIS DATABASE
                       |
                       v
              SCIENTIFIC OUTPUTS
```

---

## 🔄 Project Workflow

VISION ASTRA follows a six-stage discovery workflow:

| Stage | Process | Output |
|---|---|---|
| 01 | Planet Selection | Moon or Mars |
| 02 | Region Selection | Selected planetary target |
| 03 | Parameter Selection | Environmental comparison criteria |
| 04 | Analogue Discovery | Potential Earth locations |
| 05 | Similarity Analysis | Comparative ranking |
| 06 | Research Insights | Reports and mission applications |

```text
PLANET SELECTION
       ↓
REGION EXPLORATION
       ↓
PARAMETER SELECTION
       ↓
EARTH ANALOGUE DISCOVERY
       ↓
SIMILARITY ANALYSIS
       ↓
RANKING & COMPARISON
       ↓
SCIENTIFIC INSIGHTS
       ↓
MISSION PREPARATION
```

---

## 📐 Similarity Calculation

The current prototype demonstrates a weighted similarity approach.

### Parameter Similarity

\[
S_i = 100 - |E_i-P_i|
\]

Where:

- \(S_i\): Parameter similarity
- \(E_i\): Earth environmental index
- \(P_i\): Planetary environmental index

### Weighted Similarity

\[
S = \frac{\sum_{i=1}^{n}w_iS_i}{\sum_{i=1}^{n}w_i}
\]

Where:

- \(S\): Overall
