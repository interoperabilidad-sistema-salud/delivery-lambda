export interface Bundle {
  resourceType: "Bundle";
  type: string;
  timestamp: string;
  entry: BundleEntry[];
}

export interface BundleEntry {
  id: string;
  resource: Resource;
}

export type Resource = Patient | Composition;

export interface Patient {
  resourceType: "Patient";
  id: string;
}

export interface Composition {
  resourceType: "Composition";
  author: Author[];
}

export interface Identifier {
  value: string;
}

export interface Author {
  identifier: Identifier;
}
