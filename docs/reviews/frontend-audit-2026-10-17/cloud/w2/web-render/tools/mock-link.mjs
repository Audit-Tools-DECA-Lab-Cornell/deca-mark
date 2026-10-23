import { createElement } from "react";
export default function Link({ href, prefetch, ...rest }) { return createElement("a", { href, ...rest }); }
