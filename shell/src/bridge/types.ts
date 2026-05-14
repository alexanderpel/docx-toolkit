// Public postMessage contract between the shell and any host page that
// embeds it via iframe. APIs and protocols are not copyrightable; any host
// is free to re-declare matching types without those types becoming AGPL.

export type ShellMode = "edit" | "preview";

export type ShellTheme = "light" | "dark";

export type ShellThemeTokens = {
  background?: string;
  foreground?: string;
  muted?: string;
  mutedForeground?: string;
  border?: string;
  accent?: string;
  accentForeground?: string;
};

export type ShellUser = {
  name: string;
  email?: string;
  image?: string | null;
  color?: string;
};

export type AwarenessUser = {
  clientId: number;
  name: string;
  email?: string;
  image?: string | null;
  color?: string;
};

export type ParentToShellMessage =
  | {
      type: "init";
      nonce: string;
      documentId: string;
      hocuspocusUrl: string;
      restBaseUrl: string;
      authToken: string;
      user: ShellUser;
      theme: ShellTheme;
      themeTokens: ShellThemeTokens;
      mode: ShellMode;
    }
  | { type: "refresh-token"; authToken: string }
  | { type: "set-theme"; theme: ShellTheme; themeTokens: ShellThemeTokens }
  | { type: "destroy" };

export type ShellToParentMessage =
  | { type: "ready"; nonce?: string }
  | { type: "awareness"; users: AwarenessUser[] }
  | { type: "save-blob"; base64: string }
  | { type: "mark-seeded" }
  | { type: "navigate-document"; fileId: string }
  | { type: "error"; code: string; message: string };
