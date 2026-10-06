import {
  Body,
  Column,
  Container,
  Head as EmailHead,
  Heading,
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

interface Cta_CTAWithTopLargeImageProps {
  theme?: EmailTheme;
  heading?: string;
  subtext?: string;
  ctaLabel?: string;
  ctaHref?: string;
  imageSrc?: string;
  imageAlt?: string;
  pageBackgroundColor?: string;
  backgroundColor?: string;
  headingColor?: string;
  textColor?: string;
  buttonBackgroundColor?: string;
  buttonTextColor?: string;
}

const Cta_fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const Cta_responsiveStyles = `
    @media only screen and (max-width: 599px) {
      .cta-top-image-content {
        padding-left: 24px !important;
        padding-right: 24px !important;
      }
    }

    .cta-top-image-button:hover {
      background-color: #4338ca !important;
    }
  `;

type Cta_SectionProps = Omit<Cta_CTAWithTopLargeImageProps, "theme">;

const Cta_defaultSectionProps = {
  backgroundColor: "#fffffe",
  buttonBackgroundColor: "#4f46e5",
  buttonTextColor: "#f8fafc",
  ctaLabel: "Activate & Save",
  heading: "Built for the journey ahead.",
  headingColor: "#030712",
  imageAlt: "",
  imageSrc: "",
  pageBackgroundColor: "#f1f5f9",
  subtext:
    "You’re one step away from exploring our latest outdoor essentials. Confirm your email to complete your setup and get 10% off your first order.",
  textColor: "#4b5563",
} satisfies Cta_SectionProps;

export const Cta_CTAWithTopLargeImageSection = (props: Cta_SectionProps) => {
  const resolved = { ...Cta_defaultSectionProps, ...props };
  return (
    <Section style={{ backgroundColor: resolved.pageBackgroundColor }} width="100%">
      <Row>
        <Column>&zwj;</Column>
        <Column
          style={{
            backgroundColor: resolved.backgroundColor,
            maxWidth: "100%",
            paddingBottom: "44px",
            width: "600px",
          }}
        >
          <Section width="100%">
            <Row>
              <Column className="cta-top-image-content" style={{ padding: "0 64px", textAlign: "center" }}>
                <Section style={{ lineHeight: "44px" }}>&zwj;</Section>
                <Img
                  alt={resolved.imageAlt}
                  src={resolved.imageSrc}
                  style={{
                    borderRadius: "4px",
                    maxWidth: "100%",
                    verticalAlign: "middle",
                  }}
                  width="472"
                />
                <Section style={{ lineHeight: "24px" }}>&zwj;</Section>
                <Heading
                  style={{
                    color: resolved.headingColor,
                    fontFamily: Cta_fontFamily,
                    fontSize: "30px",
                    fontWeight: 500,
                    lineHeight: "36px",
                    margin: 0,
                    textAlign: "center",
                  }}
                  as="h2"
                >
                  {resolved.heading}
                </Heading>
                <Section style={{ lineHeight: "24px" }}>&zwj;</Section>
                <Text
                  style={{
                    color: resolved.textColor,
                    fontFamily: Cta_fontFamily,
                    fontSize: "16px",
                    fontWeight: 300,
                    lineHeight: "24px",
                    margin: 0,
                    textAlign: "center",
                  }}
                >
                  {resolved.subtext}
                </Text>
                <Section style={{ lineHeight: "36px" }}>&zwj;</Section>
                <ActionLink
                  className="cta-top-image-button"
                  href={resolved.ctaHref}
                  style={{
                    backgroundColor: resolved.buttonBackgroundColor,
                    borderRadius: "8px",
                    color: resolved.buttonTextColor,
                    display: "inline-block",
                    fontFamily: Cta_fontFamily,
                    fontSize: "16px",
                    fontWeight: 500,
                    lineHeight: "24px",
                    padding: "10px 22px",
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                >
                  {resolved.ctaLabel}
                </ActionLink>
              </Column>
            </Row>
          </Section>
        </Column>
        <Column>&zwj;</Column>
      </Row>
    </Section>
  );
};

const Cta_CTAWithTopLargeImage = ({
  pageBackgroundColor = "#f1f5f9",
  theme = defaultTheme,
  ...props
}: Cta_CTAWithTopLargeImageProps) => (
  <Html>
    <EmailHead>
      <DefaultFonts />
      <style>{Cta_responsiveStyles}</style>
    </EmailHead>
    <Preview>{props.heading ?? Cta_defaultSectionProps.heading}</Preview>
    <Tailwind config={createEmailTailwindConfig(theme)}>
      <Body
        style={{
          backgroundColor: pageBackgroundColor,
          fontFamily: Cta_fontFamily,
        }}
        className="m-0"
      >
        <Container className="mx-auto max-w-[600px] w-[600px]">
          <Cta_CTAWithTopLargeImageSection {...props} pageBackgroundColor={pageBackgroundColor} />
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

const __Cta = Cta_CTAWithTopLargeImage;

export interface TopImageCallToActionProps {
  theme?: Parameters<typeof __Cta>[0]["theme"];
  heading?: string;
  description?: string;
  action?: {
    href: string;
    label: string;
  };
  image?: {
    src: string;
    alt?: string;
  };
}

export const TopImageCallToAction = ({ theme, heading, description, action, image }: TopImageCallToActionProps) => (
  <__Cta
    ctaHref={action?.href}
    ctaLabel={action?.label}
    heading={heading}
    imageAlt={image?.alt}
    imageSrc={image?.src}
    subtext={description}
    theme={theme}
  />
);
