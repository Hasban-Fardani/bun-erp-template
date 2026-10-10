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
import { ActionLink } from "../atoms/action-link";
import { DefaultFonts } from "../atoms/font-default";

import { defaultTheme } from "../themes/default";
import type { EmailTheme } from "../themes/email-theme";
import { createEmailTailwindConfig } from "../themes/email-theme";

export type HeaderWithUserDetailsAlignment = "left" | "right";

export type HeaderWithUserDetailsAvatar = "initials" | "image";

export interface HeaderWithUserDetailsProps {
  theme?: EmailTheme;
  logoSrc?: string;
  logoAlt?: string;
  logoHref?: string;
  userName?: string;
  userEmail?: string;
  initials?: string;
  avatarSrc?: string;
  avatarAlt?: string;
  avatar?: HeaderWithUserDetailsAvatar;
  alignment?: HeaderWithUserDetailsAlignment;
  pageBackgroundColor?: string;
  backgroundColor?: string;
  avatarBackgroundColor?: string;
  headingColor?: string;
  textColor?: string;
  mutedTextColor?: string;
}

const fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const sharedDefaults = {
  avatarAlt: "",
  avatarBackgroundColor: "#f3f4f6",
  backgroundColor: "#fffffe",
  headingColor: "#030712",
  initials: "",
  logoAlt: "Logo",
  logoSrc: "",
  mutedTextColor: "#6b7280",
  pageBackgroundColor: "#f1f5f9",
  textColor: "#4b5563",
};

type SectionProps = Omit<HeaderWithUserDetailsProps, "theme">;

type ResolvedProps = typeof sharedDefaults & SectionProps;

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

const Avatar = ({ avatar, props }: { avatar: HeaderWithUserDetailsAvatar; props: ResolvedProps }) =>
  avatar === "image" && props.avatarSrc ? (
    <Img
      alt={props.avatarAlt}
      src={props.avatarSrc}
      style={{ borderRadius: "9999px", verticalAlign: "middle" }}
      width={32}
    />
  ) : (
    <Section>
      <Row>
        <Column
          style={{
            backgroundColor: props.avatarBackgroundColor,
            borderRadius: "9999px",
            height: "32px",
            textAlign: "center",
            width: "32px",
          }}
        >
          <span
            style={{
              color: props.headingColor,
              fontFamily,
              fontSize: "10px",
              fontWeight: 600,
              lineHeight: "32px",
            }}
          >
            {props.initials}
          </span>
        </Column>
      </Row>
    </Section>
  );

const Details = ({
  alignRight = false,
  avatar,
  props,
}: {
  alignRight?: boolean;
  avatar: HeaderWithUserDetailsAvatar;
  props: ResolvedProps;
}) => (
  <Section align={alignRight ? "right" : undefined} style={alignRight ? { marginLeft: "auto" } : undefined}>
    <Row>
      <Column>
        <Avatar avatar={avatar} props={props} />
      </Column>
      <Column style={{ width: "12px" }}>&zwj;</Column>
      <Column>
        {props.userName ? (
          <Text
            style={{
              color: props.textColor,
              fontFamily,
              fontSize: "12px",
              fontWeight: 500,
              lineHeight: "16px",
              margin: 0,
            }}
          >
            {props.userName}
          </Text>
        ) : null}
        {props.userEmail ? (
          <Text
            style={{
              color: props.mutedTextColor,
              fontFamily,
              fontSize: "12px",
              lineHeight: "16px",
              margin: 0,
            }}
          >
            {props.userEmail}
          </Text>
        ) : null}
      </Column>
    </Row>
  </Section>
);

export const HeaderWithUserDetailsSection = (props: SectionProps) => {
  const alignment = props.alignment ?? "left";
  const avatar = props.avatar ?? "initials";
  const resolved = {
    ...sharedDefaults,
    ...props,
  };
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
                <Section width="100%">
                  <Row>
                    {alignment === "left" ? (
                      <>
                        <Column style={{ width: "55px" }}>
                          <Logo props={resolved} />
                        </Column>
                        <Column>
                          <Details alignRight avatar={avatar} props={resolved} />
                        </Column>
                      </>
                    ) : (
                      <>
                        <Column>
                          <Details avatar={avatar} props={resolved} />
                        </Column>
                        <Column
                          style={{
                            textAlign: "right",
                            width: "55px",
                          }}
                        >
                          <Logo props={resolved} />
                        </Column>
                      </>
                    )}
                  </Row>
                </Section>
              </Column>
            </Row>
          </Section>
        </Column>
        <Column>&zwj;</Column>
      </Row>
    </Section>
  );
};

export const HeaderWithUserDetails = ({
  alignment = "left",
  avatar = "initials",
  pageBackgroundColor = "#f1f5f9",
  theme = defaultTheme,
  ...props
}: HeaderWithUserDetailsProps) => (
  <Html>
    <EmailHead>
      <DefaultFonts />
    </EmailHead>
    <Preview>{props.userName ?? props.userEmail ?? ""}</Preview>
    <Tailwind config={createEmailTailwindConfig(theme)}>
      <Body style={{ backgroundColor: pageBackgroundColor, fontFamily }} className="m-0">
        <HeaderWithUserDetailsSection
          {...props}
          alignment={alignment}
          avatar={avatar}
          pageBackgroundColor={pageBackgroundColor}
        />
      </Body>
    </Tailwind>
  </Html>
);
