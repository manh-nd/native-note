import { greetImpl } from "./lib/impl";

export function greet(name: string): string {
  return greetImpl(name);
}
