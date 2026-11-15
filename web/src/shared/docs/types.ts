// ProseMirror JSON as stored by the editor. Only the whitelisted node types are ever rendered.
export interface PMMark { type: string; attrs?: Record<string, any> }
export interface PMNode { type: string; attrs?: Record<string, any>; content?: PMNode[]; text?: string; marks?: PMMark[] }

export interface WebappSettings {
  display: "full" | "framed";
  height: { mode: "fixed" | "auto" | "viewport"; px: number };
  theme: boolean;
  cdns: string[];
  intro?: PMNode | null;
}

export interface BundleFiles { sha: string; files: Record<string, { sha: string; mime: string; size: number }> }

/** pages/<id>.json as the viewer reads. */
export interface PublicPage {
  schemaVersion: number;
  kind: "rich" | "webapp";
  title: string;
  updatedAt: string | null;
  body?: PMNode;
  settings?: WebappSettings;
  intro?: PMNode | null;
  bundle?: BundleFiles;
  embeds: Record<string, { settings: WebappSettings; bundle: BundleFiles }>;
  assets: Record<string, { mime: string; size: number; name: string; /** Path of the file next to the page, such as a/<sha>.png. */ file?: string }>;
}
