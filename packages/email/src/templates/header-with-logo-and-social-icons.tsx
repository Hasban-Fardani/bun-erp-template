import {
  Body,
  Column,
  Head as EmailHead,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
} from "@react-email/components";
import { Fragment } from "react";
import { ActionLink } from "../atoms/action-link";
import { DefaultFonts } from "../atoms/font-default";

import { defaultTheme } from "../themes/default";
import type { EmailTheme } from "../themes/email-theme";
import { createEmailTailwindConfig } from "../themes/email-theme";

export type HeaderWithLogoAndSocialIconsAlignment = "left" | "center" | "right";

export interface HeaderSocialLink {
  alt: string;
  href: string;
  src: string;
}

export interface HeaderWithLogoAndSocialIconsProps {
  theme?: EmailTheme;
  logoSrc?: string;
  logoAlt?: string;
  logoHref?: string;
  socials?: HeaderSocialLink[];
  alignment?: HeaderWithLogoAndSocialIconsAlignment;
  pageBackgroundColor?: string;
  backgroundColor?: string;
}

const fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const defaults = {
  backgroundColor: "#fffffe",
  logoAlt: "Logo",
  logoSrc: "",
  pageBackgroundColor: "#f1f5f9",
  socials: [] as HeaderSocialLink[],
};

type SectionProps = Omit<HeaderWithLogoAndSocialIconsProps, "theme">;

type ResolvedProps = typeof defaults & SectionProps;

const Logo = ({ props }: { props: ResolvedProps }) => {
  if (!props.logoSrc) {
    return null;
  }
  return (
    <ActionLink href={props.logoHref}>
      <Img alt={props.logoAlt} src={props.logoSrc} style={{ maxWidth: "100%", verticalAlign: "middle" }} width={55} />
    </ActionLink>
  );
};

const Socials = ({ align, props }: { align?: "center" | "right"; props: ResolvedProps }) => {
  let tableStyle:
    | {
        marginLeft: string;
        marginRight?: string;
      }
    | undefined;
  if (align === "center") {
    tableStyle = { marginLeft: "auto", marginRight: "auto" };
  } else if (align === "right") {
    tableStyle = { marginLeft: "auto" };
  }
  return (
    <Section align={align} style={tableStyle}>
      <Row>
        {props.socials.slice(0, 3).map((social, index) => (
          <Fragment key={social.alt + social.href}>
            {index > 0 ? <Column style={{ width: "24px" }}>&zwj;</Column> : null}
            <Column>
              <Link href={social.href}>
                <Img
                  alt={social.alt}
                  src={social.src}
                  style={{ maxWidth: "100%", verticalAlign: "middle" }}
                  width={20}
                />
              </Link>
            </Column>
          </Fragment>
        ))}
      </Row>
    </Section>
  );
};

export const HeaderWithLogoAndSocialIconsSection = (props: SectionProps) => {
  const alignment = props.alignment ?? "left";
  const resolved = { ...defaults, ...props } as ResolvedProps;
  let content: import("react").ReactNode;
  if (alignment === "center") {
    content = (
      <Section width="100%">
        <Row>
          <Column>
            <Section style={{ textAlign: "center" }}>
              <Logo props={resolved} />
            </Section>
            <Section style={{ lineHeight: "24px" }}>&zwj;</Section>
            <Socials align="center" props={resolved} />
          </Column>
        </Row>
      </Section>
    );
  } else if (alignment === "right") {
    content = (
      <Section width="100%">
        <Row>
          <Column>
            <Socials props={resolved} />
          </Column>
          <Column style={{ textAlign: "right", width: "55px" }}>
            <Logo props={resolved} />
          </Column>
        </Row>
      </Section>
    );
  } else {
    content = (
      <Section width="100%">
        <Row>
          <Column style={{ width: "55px" }}>
            <Logo props={resolved} />
          </Column>
          <Column>
            <Socials align="right" props={resolved} />
          </Column>
        </Row>
      </Section>
    );
  }
  return (
    <Section style={{ backgroundColor: resolved.pageBackgroundColor }} width="100%">
      <Row>
        <Column>&zwj;</Column>
        <Column style={{ maxWidth: "100%", width: "600px" }}>
          <Section width="100%">
            <Row>
              <Column
                style={{
                  backgroundColor: resolved.backgroundColor,
                  padding: "24px",
                }}
              >
                {content}
              </Column>
            </Row>
          </Section>
        </Column>
        <Column>&zwj;</Column>
      </Row>
    </Section>
  );
};

export const HeaderWithLogoAndSocialIcons = ({
  alignment = "left",
  pageBackgroundColor = "#f1f5f9",
  theme = defaultTheme,
  ...props
}: HeaderWithLogoAndSocialIconsProps) => (
  <Html>
    <EmailHead>
      <DefaultFonts />
    </EmailHead>
    <Preview>Maizzle on GitHub, LinkedIn, and X</Preview>
    <Tailwind config={createEmailTailwindConfig(theme)}>
      <Body style={{ backgroundColor: pageBackgroundColor, fontFamily }} className="m-0">
        <HeaderWithLogoAndSocialIconsSection
          {...props}
          alignment={alignment}
          pageBackgroundColor={pageBackgroundColor}
        />
      </Body>
    </Tailwind>
  </Html>
);
