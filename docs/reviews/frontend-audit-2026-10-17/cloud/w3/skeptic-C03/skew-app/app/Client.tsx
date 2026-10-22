"use client";
import { ping, save } from "./actions";
export function Client() { return <button onClick={async () => { await ping("a"); await save("b", 1); }}>go</button>; }
