import { isRouteErrorResponse, Link, useRouteError } from "react-router";
import { Masthead } from "./Masthead";
export function CoverAccessError() {
  const error=useRouteError();
  const denied=isRouteErrorResponse(error)&&[401,403].includes(error.status);
  return <main className="editorial-page"><Masthead/><section className="op-workspace"><h1>{denied?"Cover committee access is restricted.":"Cover workspace unavailable."}</h1><p>{denied?"Sign in with an active Moderator or Admin account and accept the current Pocket Guide.":"Please retry shortly. Your saved covers are unchanged."}</p><Link to="/">RETURN TO PUBLICATION</Link></section></main>;
}
