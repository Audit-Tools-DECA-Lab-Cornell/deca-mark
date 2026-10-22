"use server";
export async function ping(x: string) { return `pong changed ${x} ${Date.now()}`; }
export async function save(a: string, b: number) { return { a, b }; }
