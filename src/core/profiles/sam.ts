// Sam's commute: Letchworth Garden City ⇄ King's Cross / St Pancras / Farringdon.
import type { LatLon, Profile } from "../types";

// Approximate line from Letchworth through Hitchin, Stevenage, Knebworth, Welwyn, Hatfield, Potters Bar,
// New Southgate, Alexandra Palace and Finsbury Park.
const LINE_NORTH: LatLon[] = [[51.9799, -0.2290], [51.9533, -0.2635], [51.9017, -0.2071], [51.8667, -0.1876], [51.8233, -0.1920], [51.8010, -0.2040],
  [51.7638, -0.2156], [51.6973, -0.1925], [51.6141, -0.1431], [51.5983, -0.1201], [51.5646, -0.1063]];

export const samCommute: Profile = {
  id: "sam-commute",
  name: "Sam: Cartref ⇄ 20 Mansfield Street",
  home: "LET",
  stationNames: { LET: "Letchworth", KGX: "King's Cross", STP: "St Pancras", ZFD: "Farringdon" },
  hubNames: { KGX: "King's Cross", STP: "St Pancras", ZFD: "Farringdon" },
  stationPatterns: { LET: "letchworth", STP: "st\\.? ?pancras", KGX: "king'?s cross", ZFD: "farringdon" },
  coords: { LET: "51.98002,-0.22909", KGX: "51.53197,-0.12341", STP: "51.53062,-0.12594", ZFD: "51.52036,-0.10514" },
  lines: {
    KGX: [...LINE_NORTH, [51.5308, -0.1238]],
    STP: [...LINE_NORTH, [51.5307, -0.1257]],
    ZFD: [...LINE_NORTH, [51.5307, -0.1257], [51.5203, -0.1053]],
  },
  maxTrainMin: { KGX: 55, STP: 55, ZFD: 60 },
  stoppingMin: { KGX: 45, STP: 45, ZFD: 52 },
  topWindowMin: 20,
  // Approximate station positions (to ~200 m) along Letchworth ⇄ London, for placing a train from Service Details.
  stationGeo: {
    LET: [51.9799, -0.2290], HIT: [51.9533, -0.2635], SVG: [51.9017, -0.2071], KBW: [51.8667, -0.1876], WLW: [51.8233, -0.1920],
    WGC: [51.8010, -0.2040], HAT: [51.7638, -0.2156], WMG: [51.7363, -0.2104], BPK: [51.7210, -0.2045], PBR: [51.6973, -0.1925],
    HDW: [51.6685, -0.1762], NBA: [51.6486, -0.1730], OKL: [51.6378, -0.1663], NSG: [51.6141, -0.1431], AAP: [51.5983, -0.1201],
    HGY: [51.5865, -0.1119], HRY: [51.5772, -0.1050], FPK: [51.5646, -0.1063], KGX: [51.5308, -0.1238], STP: [51.5307, -0.1257], ZFD: [51.5203, -0.1053],
  },
  mergeHubs: ["ZFD", "STP"],
  operatorByHub: { KGX: "Great Northern", STP: "Thameslink", ZFD: "Thameslink" },
  // Fast long-distance Great Northern trains (Cambridge / Ely / King's Lynn) reaching King's Cross 08:00–08:30,
  // Tue–Thu, Hertfordshire school term time (holidays from hertfordshire.gov.uk; after Sep 2028 all term).
  busy: {
    from: "LET", to: "KGX", operator: "great northern",
    arrFrom: "08:00", arrTo: "08:30", days: [2, 3, 4], maxMins: 32, origins: "cambridge|ely|king'?s lynn",
    holidays: [
      ["2026-10-26", "2026-10-30"], ["2026-12-21", "2027-01-01"], ["2027-02-15", "2027-02-19"], ["2027-03-26", "2027-04-09"],
      ["2027-05-31", "2027-06-04"], ["2027-07-23", "2027-08-31"], ["2027-10-25", "2027-10-29"], ["2027-12-20", "2028-01-03"],
      ["2028-02-14", "2028-02-18"], ["2028-04-03", "2028-04-17"], ["2028-05-29", "2028-06-02"], ["2028-07-25", "2028-09-01"],
    ],
  },
};
