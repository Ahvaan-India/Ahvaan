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
    description: "Citywide heat watch & executive status dashboard",
  },
  {
    id: "maps",
    label: "Heat Map",
    href: "/maps",
    iconName: "Map",
    description: "Interactive 144-ward choropleth & spatial analysis",
  },
  {
    id: "analysis",
    label: "Ward Analysis",
    href: "/analysis",
    iconName: "BarChart3",
    description: "In-depth ward thermal profiles & risk breakdown",
  },
  {
    id: "alerts",
    label: "Alert Dispatch",
    href: "/alerts",
    iconName: "Bell",
    description: "Municipal heat advisories & emergency notifications",
  },
];
