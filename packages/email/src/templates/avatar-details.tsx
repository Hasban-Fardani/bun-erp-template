import {
  Body,
  Column,
  Head as EmailHead,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

import { DefaultFonts } from "../atoms/font-default";

import { defaultTheme } from "../themes/default";
import type { EmailTheme } from "../themes/email-theme";
import { createEmailTailwindConfig } from "../themes/email-theme";

type AvatarAlignment = "center" | "left" | "right";
const fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const AvatarShell = ({ children }: { children: ReactNode }) => (
  <Section style={{ backgroundColor: "#f1f5f9" }}>
    <Section style={{ height: "100px" }} />
    <Section
      style={{
        backgroundColor: "#fffffe",
        fontFamily,
        marginLeft: "auto",
        marginRight: "auto",
        maxWidth: "600px",
        paddingBottom: "44px",
      }}
    >
      <Section style={{ paddingLeft: "24px", paddingRight: "24px" }}>
        <Section style={{ lineHeight: "44px" }}>&zwj;</Section>
        {children}
      </Section>
    </Section>
    <Section style={{ height: "100px" }} />
  </Section>
);

export const AvatarWithDetailsSection = ({
  align = "center",
  avatarUrl,
  email = "",
  mjmlCompensation = false,
  name = "Team member",
}: {
  align?: AvatarAlignment;
  avatarUrl?: string;
  email?: string;
  mjmlCompensation?: boolean;
  name?: string;
}) => {
  let alignmentStyle: CSSProperties = {
    marginLeft: "auto",
    marginRight: "auto",
  };
  if (align === "left") {
    alignmentStyle = { marginRight: "auto" };
  } else if (align === "right") {
    alignmentStyle = { marginLeft: "auto" };
  }
  return (
    <AvatarShell>
      <Section
        style={{
          borderSpacing: 0,
          ...(mjmlCompensation && align === "center" ? { left: "1px", position: "relative" as const } : {}),
          ...alignmentStyle,
        }}
      >
        <Row>
          <Column style={{ verticalAlign: "top" }}>
            {avatarUrl ? (
              <Img
                alt={name}
                height={48}
                src={avatarUrl}
                style={{
                  borderRadius: "9999px",
                  maxWidth: "100%",
                  verticalAlign: "middle",
                }}
                width={48}
              />
            ) : (
              <Text
                aria-label={name}
                style={{
                  backgroundColor: "#e5e7eb",
                  borderRadius: "9999px",
                  color: "#374151",
                  fontSize: "16px",
                  height: "48px",
                  lineHeight: "48px",
                  margin: 0,
                  textAlign: "center",
                  width: "48px",
                }}
              >
                {name.trim().charAt(0).toUpperCase() || "?"}
              </Text>
            )}
          </Column>
          <Column style={{ width: "12px" }} />
          <Column style={{ textAlign: "left", verticalAlign: "top" }}>
            <Text
              style={{
                color: "#030712",
                fontFamily,
                fontSize: "14px",
                fontWeight: 500,
                lineHeight: "20px",
                margin: 0,
              }}
            >
              {name}
            </Text>
            <Text
              style={{
                color: "#6b7280",
                fontFamily,
                fontSize: "14px",
                fontWeight: 400,
                lineHeight: "20px",
                margin: 0,
                whiteSpace: "nowrap",
              }}
            >
              {email}
            </Text>
          </Column>
        </Row>
      </Section>
    </AvatarShell>
  );
};

interface Avatar_AvatarWithDetailsProps {
  align?: AvatarAlignment;
  avatarUrl?: string;
  email?: string;
  name?: string;
  theme?: EmailTheme;
}

const Avatar_AvatarWithDetails = ({ theme = defaultTheme, ...props }: Avatar_AvatarWithDetailsProps) => (
  <Html>
    <EmailHead>
      <DefaultFonts />
    </EmailHead>
    <Preview>Avatar with details</Preview>
    <Tailwind config={createEmailTailwindConfig(theme)}>
      <Body style={{ backgroundColor: "#f1f5f9" }} className="m-0">
        <AvatarWithDetailsSection {...props} />
      </Body>
    </Tailwind>
  </Html>
);

const __Avatar = Avatar_AvatarWithDetails;

export interface AvatarDetailsProps {
  theme?: Parameters<typeof __Avatar>[0]["theme"];
  avatar?: {
    name: string;
    url?: string;
  };
  name?: string;
  email?: string;
  align?: "left" | "center" | "right";
}

export const AvatarDetails = ({ theme, avatar, name, email, align }: AvatarDetailsProps) => (
  <__Avatar align={align} avatarUrl={avatar?.url} email={email} name={name ?? avatar?.name} theme={theme} />
);
