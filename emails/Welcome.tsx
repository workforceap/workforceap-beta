import {
  Button,
  Heading,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import Layout from "./Layout";

interface WelcomeEmailProps {
  userName?: string;
  loginUrl?: string;
}

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.workforceap.org";

const WelcomeEmail = ({
  userName = "there",
  loginUrl = `${baseUrl}/login`,
}: WelcomeEmailProps) => {
  return (
    <Layout previewText="Welcome to the Workforce Advancement Project!">
      <Heading style={h1}>Welcome to WorkforceAP</Heading>
      
      <Text style={text}>Hi {userName},</Text>
      
      <Text style={text}>
        We're thrilled to have you join the Workforce Advancement Project. Our mission is to connect you with the career training and industry certifications you need to succeed.
      </Text>
      
      <Text style={text}>
        To get started, please sign in to your dashboard to complete your profile and explore available opportunities.
      </Text>
      
      <Section style={btnContainer}>
        <Button style={button} href={loginUrl}>
          Sign in to your Dashboard
        </Button>
      </Section>
      
      <Text style={text}>
        If you have any questions along the way, our support team is always here to help.
      </Text>
      
      <Text style={text}>
        Best,<br />
        The WorkforceAP Team
      </Text>
    </Layout>
  );
};

export default WelcomeEmail;

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
