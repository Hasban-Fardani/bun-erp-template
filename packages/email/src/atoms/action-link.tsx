import { Link } from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

export interface ActionLinkProps {
  href?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** Keep the visual treatment when no destination is supplied without emitting a dead link. */
export const ActionLink = ({ children, className, href, style }: ActionLinkProps) => {
  if (href) {
    return (
      <Link className={className} href={href} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <span className={className} style={style}>
      {children}
    </span>
  );
};
