"use client";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";

export type EditorCommand = { key: string; label: string; hint: string; icon: React.ReactNode; run(): void };
export function SlashCommandMenu({ x, y, commands, selected, onChoose }: { x: number; y: number; commands: EditorCommand[]; selected: number; onChoose(index: number): void }) {
  return <div className="slash-command-popover" style={{ left: x, top: y }} role="listbox"><Command shouldFilter={false}><CommandList><CommandEmpty>Không tìm thấy lệnh.</CommandEmpty><CommandGroup heading="Blocks & AI">{commands.map((command, index) => <CommandItem key={command.key} value={command.key} data-manual-selected={index === selected} onMouseDown={(event) => event.preventDefault()} onSelect={() => onChoose(index)}>{command.icon}<span className="flex flex-col"><span>{command.label}</span><small className="text-muted-foreground">{command.hint}</small></span></CommandItem>)}</CommandGroup></CommandList></Command></div>;
}
