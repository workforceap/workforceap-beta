import {
  Button,
  Heading,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import Layout from "./Layout";

interface MagicLinkEmailProps {
  loginUrl?: string;
  userEmail?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.workforceap.org";

const MagicLinkEmail = ({
  loginUrl = `${baseUrl}/login`,
  userEmail = "you@example.com",
}: MagicLinkEmailProps) => {
  return (
    <Layout previewText="Your secure login link for WorkforceAP">
      <Heading style={h1}>Secure Login</Heading>
      
      <Text style={text}>
        We received a request to sign in to WorkforceAP using this email address ({userEmail}).
      </Text>
      
      <Text style={text}>
        Click the button below to securely sign in. This link is valid for 15 minutes and can only be used once.
      </Text>
      
      <Section style={btnContainer}>
        <Button style={button} href={loginUrl}>
          Sign in to WorkforceAP
        </Button>
      </Section>
      
      <Text style={text}>
        If you are on a mobile device or the button doesn't work, copy and paste this URL into your browser:
      </Text>
      
      <Text style={linkText}>
        <a href={loginUrl} style={link}>
          {loginUrl}
        </a>
      </Text>
      
      <Text style={text}>
        If you didn't request this email, you can safely ignore it.
      </Text>
    </Layout>
  );
};

export default MagicLinkEmail;

const h1 = {
  color: "#1a1a1a",
  fontSize: "24px",
  fontWeight: "600",
  lineHeight: "32px",
  margin: "0 0 16px",
};

const text = {
  color: "#333333",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const btnContainer = {
  margin: "24px 0",
};

const button = {
  backgroundColor: "#ad2c4d",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 24px",
};

const linkText = {
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const link = {
  color: "#ad2c4d",
  textDecoration: "underline",
  wordBreak: "break-all" as const,
};
