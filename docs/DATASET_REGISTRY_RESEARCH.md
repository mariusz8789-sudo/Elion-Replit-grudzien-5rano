# Dry dataset-registry research note

## Scope

This note records metadata research for a **future** Genesis data-adapter registry. No external dataset was downloaded, stored, queried, transformed, mapped to CityWorld, or used by an Earthquake scenario. The active Earthquake demonstrator remains synthetic and scenario-only.

## Official-source findings

The USGS FDSN Event Web Service documents custom Earthquake Catalog queries, multiple output formats including GeoJSON, UTC/ISO-8601 time conventions, catalog/contributor filtering and an explicit 20,000-event query limit. These details support a future artifact adapter’s provenance capture, but are not an approval to call the service from Genesis. [1]

The USGS ANSS Comprehensive Earthquake Catalog documentation describes contributed source parameters and warns that reported depth may use different reference surfaces and determination methods across seismic networks. Consequently, any future adapter must preserve provider fields and uncertainty metadata rather than treat a reported depth as a normalized, directly map-ready Genesis coordinate. [2]

| Candidate source                     | Registry status     | Required future controls                                                                                                                                                                                                  |
| ------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| USGS ComCat / FDSN Event Web Service | `DRY_METADATA_ONLY` | Legal/terms review, explicit endpoint and query capture, immutable raw-response hash, retrieval timestamp, CRS/vertical-reference policy, uncertainty preservation, and a separately audited coordinate-mapping decision. |

## Non-conclusions

This research does not establish a license grant, a production SLA, calibration, forecast capability, real-world facility association, damage model, or live operating capability. Any adapter remains blocked until it satisfies the existing artifact/input/run/evidence/replay gates and an independently approved spatial-policy review.

## References

[1]: https://earthquake.usgs.gov/fdsnws/event/1/ 'USGS — API Documentation: Earthquake Catalog'
[2]: https://earthquake.usgs.gov/data/comcat/ 'USGS — ANSS Comprehensive Earthquake Catalog Documentation'
