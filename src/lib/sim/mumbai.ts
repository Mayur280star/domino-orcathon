import type { City } from "./types";

// Mumbai monsoon scenario. Locations are real places; populations, thresholds,
// and dependency probabilities are illustrative values tuned for the demo,
// not official risk data.
export const MUMBAI: City = {
  id: "mumbai",
  name: "Mumbai",
  center: [19.088, 72.89],
  zoom: 12,
  nodes: [
    // Low-lying flood pockets
    { id: "hindmata", name: "Hindmata, Dadar–Parel", short: "Hindmata", kind: "flood", lat: 19.0075, lng: 72.8445, exposed: 180000, severity: 0.08, threshold: 150 },
    { id: "kingscircle", name: "King's Circle–Gandhi Market", short: "King's Circle", kind: "flood", lat: 19.029, lng: 72.8565, exposed: 220000, severity: 0.08, threshold: 170 },
    { id: "dharavi", name: "Dharavi", short: "Dharavi", kind: "flood", lat: 19.0405, lng: 72.851, exposed: 500000, severity: 0.07, threshold: 240 },
    { id: "kurla", name: "Kurla, LBS Marg", short: "Kurla", kind: "flood", lat: 19.072, lng: 72.881, exposed: 300000, severity: 0.08, threshold: 165 },
    { id: "mithi", name: "Mithi river belt, Kalina–BKC", short: "Mithi belt", kind: "flood", lat: 19.075, lng: 72.862, exposed: 160000, severity: 0.08, threshold: 200 },
    { id: "milan", name: "Milan Subway, Santacruz", short: "Milan Subway", kind: "flood", lat: 19.083, lng: 72.843, exposed: 120000, severity: 0.07, threshold: 190 },
    { id: "andheri", name: "Andheri Subway", short: "Andheri", kind: "flood", lat: 19.119, lng: 72.8455, exposed: 260000, severity: 0.07, threshold: 210 },
    { id: "sakinaka", name: "Saki Naka", short: "Saki Naka", kind: "flood", lat: 19.106, lng: 72.888, exposed: 200000, severity: 0.07, threshold: 260 },
    { id: "malad", name: "Malad Subway", short: "Malad", kind: "flood", lat: 19.1845, lng: 72.8475, exposed: 180000, severity: 0.07, threshold: 280 },

    // Hillside settlements
    { id: "chembur", name: "Bharat Nagar slopes, Chembur", short: "Chembur slopes", kind: "landslide", lat: 19.048, lng: 72.916, exposed: 6000, severity: 0.45, threshold: 270 },
    { id: "vikhroli", name: "Surya Nagar slopes, Vikhroli", short: "Vikhroli slopes", kind: "landslide", lat: 19.113, lng: 72.93, exposed: 5000, severity: 0.45, threshold: 300 },
    { id: "asalpha", name: "Asalpha hills, Ghatkopar", short: "Asalpha hills", kind: "landslide", lat: 19.096, lng: 72.899, exposed: 8000, severity: 0.4, threshold: 340 },
    { id: "khindipada", name: "Khindipada slopes, Bhandup", short: "Khindipada", kind: "landslide", lat: 19.16, lng: 72.931, exposed: 7000, severity: 0.4, threshold: 290 },
    { id: "pimpripada", name: "Pimpripada slopes, Malad East", short: "Pimpripada", kind: "landslide", lat: 19.193, lng: 72.87, exposed: 5000, severity: 0.45, threshold: 360 },

    // Power
    { id: "sub_dadar", name: "Dadar receiving substation", short: "Dadar substation", kind: "power", lat: 19.0185, lng: 72.844, exposed: 450000, severity: 0.012 },
    { id: "sub_kurla", name: "Kurla substation", short: "Kurla substation", kind: "power", lat: 19.064, lng: 72.8875, exposed: 520000, severity: 0.012 },
    { id: "sub_andheri", name: "Andheri substation", short: "Andheri substation", kind: "power", lat: 19.115, lng: 72.856, exposed: 480000, severity: 0.012 },
    { id: "sub_vikhroli", name: "Vikhroli substation", short: "Vikhroli substation", kind: "power", lat: 19.103, lng: 72.926, exposed: 400000, severity: 0.012 },

    // Water
    { id: "wtp_bhandup", name: "Bhandup water treatment complex", short: "Bhandup WTP", kind: "water", lat: 19.147, lng: 72.94, exposed: 1000000, severity: 0.004 },
    { id: "pump_sion", name: "Sion pumping station", short: "Sion pumping", kind: "water", lat: 19.042, lng: 72.8685, exposed: 400000, severity: 0.005 },
    { id: "pump_ghatkopar", name: "Ghatkopar pumping station", short: "Ghatkopar pumping", kind: "water", lat: 19.088, lng: 72.913, exposed: 450000, severity: 0.005 },
    { id: "pump_andheri", name: "Vile Parle pumping station", short: "Vile Parle pumping", kind: "water", lat: 19.104, lng: 72.852, exposed: 500000, severity: 0.005 },

    // Areas at risk of contaminated drinking water
    { id: "c_central", name: "Sion–Matunga–Wadala supply zone", short: "Sion–Wadala water", kind: "contam", lat: 19.023, lng: 72.865, exposed: 420000, severity: 0.06 },
    { id: "c_east", name: "Ghatkopar–Vidyavihar supply zone", short: "Ghatkopar water", kind: "contam", lat: 19.072, lng: 72.9, exposed: 450000, severity: 0.06 },
    { id: "c_west", name: "Andheri–Vile Parle supply zone", short: "Andheri water", kind: "contam", lat: 19.098, lng: 72.865, exposed: 500000, severity: 0.06 },
    { id: "c_north", name: "Bhandup–Mulund supply zone", short: "Bhandup water", kind: "contam", lat: 19.17, lng: 72.95, exposed: 380000, severity: 0.06 },

    // Hospitals (exposed = inpatients plus expected emergency cases)
    { id: "h_kem", name: "KEM Hospital, Parel", short: "KEM Hospital", kind: "hospital", lat: 19.0026, lng: 72.842, exposed: 5400, severity: 0.9 },
    { id: "h_sion", name: "Sion Hospital (LTMG)", short: "Sion Hospital", kind: "hospital", lat: 19.0345, lng: 72.8604, exposed: 4200, severity: 0.9 },
    { id: "h_rajawadi", name: "Rajawadi Hospital, Ghatkopar", short: "Rajawadi Hospital", kind: "hospital", lat: 19.0815, lng: 72.9045, exposed: 1800, severity: 0.9 },
    { id: "h_cooper", name: "Cooper Hospital, Juhu", short: "Cooper Hospital", kind: "hospital", lat: 19.1075, lng: 72.8365, exposed: 1900, severity: 0.9 },
  ],
  edges: [
    // Floodwater reaches electrical and water equipment
    { from: "hindmata", to: "sub_dadar", p: 0.6, delay: 1, via: "flood", label: "floodwater enters substation" },
    { from: "kurla", to: "sub_kurla", p: 0.7, delay: 1, via: "flood", label: "floodwater enters substation" },
    { from: "mithi", to: "sub_kurla", p: 0.35, delay: 2, via: "flood", label: "Mithi overflow reaches substation" },
    { from: "andheri", to: "sub_andheri", p: 0.55, delay: 1, via: "flood", label: "floodwater enters substation" },
    { from: "kingscircle", to: "pump_sion", p: 0.45, delay: 2, via: "flood", label: "pump house inundated" },
    { from: "sakinaka", to: "pump_andheri", p: 0.3, delay: 2, via: "flood", label: "pump house inundated" },

    // Landslide debris
    { from: "vikhroli", to: "sub_vikhroli", p: 0.45, delay: 0, via: "debris", label: "transmission tower hit" },
    { from: "khindipada", to: "wtp_bhandup", p: 0.4, delay: 1, via: "debris", label: "intake pipeline damaged" },
    { from: "asalpha", to: "pump_ghatkopar", p: 0.3, delay: 1, via: "debris", label: "debris blocks pump station" },

    // Lost power stops pumps
    { from: "sub_dadar", to: "pump_sion", p: 0.85, delay: 1, via: "power", label: "pumps lose power" },
    { from: "sub_kurla", to: "pump_ghatkopar", p: 0.85, delay: 1, via: "power", label: "pumps lose power" },
    { from: "sub_andheri", to: "pump_andheri", p: 0.85, delay: 1, via: "power", label: "pumps lose power" },
    { from: "sub_vikhroli", to: "wtp_bhandup", p: 0.75, delay: 1, via: "power", label: "treatment plant loses power" },

    // Broken supply leads to contaminated water
    { from: "pump_sion", to: "c_central", p: 0.8, delay: 4, via: "supply", label: "low pressure lets sewage into mains" },
    { from: "pump_ghatkopar", to: "c_east", p: 0.8, delay: 4, via: "supply", label: "low pressure lets sewage into mains" },
    { from: "pump_andheri", to: "c_west", p: 0.8, delay: 4, via: "supply", label: "low pressure lets sewage into mains" },
    { from: "wtp_bhandup", to: "c_north", p: 0.85, delay: 5, via: "supply", label: "untreated water in supply" },
    { from: "wtp_bhandup", to: "c_east", p: 0.45, delay: 6, via: "supply", label: "untreated water in supply" },
    { from: "wtp_bhandup", to: "c_central", p: 0.35, delay: 6, via: "supply", label: "untreated water in supply" },
    { from: "dharavi", to: "c_central", p: 0.3, delay: 6, via: "flood", label: "sewage mixes with floodwater" },
    { from: "kurla", to: "c_east", p: 0.25, delay: 6, via: "flood", label: "sewage mixes with floodwater" },
    { from: "milan", to: "c_west", p: 0.25, delay: 6, via: "flood", label: "sewage mixes with floodwater" },

    // Hospitals: backup diesel runs out, or ambulance routes are cut
    { from: "sub_dadar", to: "h_kem", p: 0.4, delay: 6, via: "power", label: "backup diesel runs out" },
    { from: "sub_dadar", to: "h_sion", p: 0.35, delay: 6, via: "power", label: "backup diesel runs out" },
    { from: "sub_kurla", to: "h_rajawadi", p: 0.5, delay: 6, via: "power", label: "backup diesel runs out" },
    { from: "sub_andheri", to: "h_cooper", p: 0.45, delay: 6, via: "power", label: "backup diesel runs out" },
    { from: "hindmata", to: "h_kem", p: 0.4, delay: 2, via: "access", label: "ambulance routes cut" },
    { from: "kingscircle", to: "h_sion", p: 0.45, delay: 2, via: "access", label: "ambulance routes cut" },
    { from: "kurla", to: "h_rajawadi", p: 0.2, delay: 3, via: "access", label: "ambulance routes cut" },
    { from: "andheri", to: "h_cooper", p: 0.25, delay: 2, via: "access", label: "ambulance routes cut" },
  ],
};
