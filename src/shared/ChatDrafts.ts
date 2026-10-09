// Session-only state shared by both chat surfaces; never sent before explicit Send.
export class ChatDrafts {
  private drafts = new Map<string, string>();
  private revisions = new Map<string, number>();
  private sequence = 0;
  private active = "";
  private generation: number | null = null;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit() { this.listeners.forEach((listener) => listener()); }
  activeId = () => this.active;
  setActive(id: string | ((current: string) => string)) { this.active = typeof id === "function" ? id(this.active) : id; this.emit(); }
  get(id: string) { return this.drafts.get(id) ?? ""; }
  revision(id: string) { return this.revisions.get(id) ?? 0; }
  set(id: string, value: string) { this.revisions.set(id, ++this.sequence); if (value) this.drafts.set(id, value); else this.drafts.delete(id); this.emit(); }
  clearIfUnchanged(id: string, sent: string) { if (this.get(id).trim() === sent.trim()) this.set(id, ""); }
  recoverIfEmpty(id: string, sent: string, expectedRevision?: number) { if (!this.get(id) && (expectedRevision === undefined || this.revision(id) === expectedRevision)) this.set(id, sent); }
  transferNewChat(id: string) { const text = this.get(""); this.drafts.delete(""); if (text) this.drafts.set(id, text); this.emit(); }
  delete(id: string) { this.drafts.delete(id); this.revisions.delete(id); this.emit(); }
  reconcileGeneration(generation: number) {
    if (this.generation !== null && this.generation !== generation) this.reset();
    this.generation = generation;
  }
  reset() { this.drafts.clear(); this.revisions.clear(); this.active = ""; this.emit(); }
}
