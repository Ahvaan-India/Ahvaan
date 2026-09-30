/**
 * Navigation Configuration powering site-wide headers and sidebars.
 */

export interface NavItem {
  id: string;
  label: string;
  href: string;
  iconName: "Map" | "BarChart3" | "Bell" | "Activity" | "Shield";
  description: string;
  exact?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    href: "/overview",
    iconName: "Activity",
    description: "District zone stats & vulnerability leaderboard",
  },
  {
    id: "maps",
    label: "Heat Map",
    href: "/maps",
    iconName: "Map",
    description: "Interactive zone heatmap across 3 districts",
  },
  {
    id: "alerts",
    label: "Alerts",
    href: "/alerts",
    iconName: "Bell",
    description: "Logged heat warnings, emergency advisories & dispatch history",
  },
];
