import { Font } from "@react-email/components";

export const DefaultFonts = () => (
  <>
    <style>{`@import url('https://rsms.me/inter/inter.css');`}</style>
    <Font
      fontFamily="Inter"
      fallbackFontFamily={["Arial", "sans-serif"]}
      webFont={{
        format: "truetype",
        url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuOKfMZg.ttf",
      }}
      fontWeight={400}
      fontStyle="normal"
    />
    <Font
      fontFamily="Inter"
      fallbackFontFamily={["Arial", "sans-serif"]}
      webFont={{
        format: "truetype",
        url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fMZg.ttf",
      }}
      fontWeight={500}
      fontStyle="normal"
    />
    <Font
      fontFamily="Inter"
      fallbackFontFamily={["Arial", "sans-serif"]}
      webFont={{
        format: "truetype",
        url: "https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf",
      }}
      fontWeight={600}
      fontStyle="normal"
    />
  </>
);
