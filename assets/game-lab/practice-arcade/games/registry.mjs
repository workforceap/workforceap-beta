// The program games shown on the hub (index.html), in display order.
// Each id is a folder under games/ and equals the programSlug in data/source/<id>.json.
// The hub imports games/<id>/game.mjs for the title, tagline and levels; an entry whose
// game file is missing shows as "coming soon". Demo games (demo-*, help-desk-demo) are
// test fixtures and are not listed here.
export const CATEGORIES = [
  {id: 'digital-literacy', label: 'Digital Literacy'},
  {id: 'it-cyber', label: 'IT & Cybersecurity'},
  {id: 'cloud-data', label: 'Cloud & Data'},
  {id: 'ai-software', label: 'AI & Software Dev'},
  {id: 'business', label: 'Business'},
  {id: 'healthcare', label: 'Healthcare'},
  {id: 'manufacturing', label: 'Manufacturing & Logistics'},
  {id: 'construction', label: 'Construction & Trades'}
];

export default [
  {id: 'digital-literacy-empowerment-class', category: 'digital-literacy'},
  {id: 'it-support-professional-certificate-ibm', category: 'it-cyber'},
  {id: 'comptia-a-professional-certificate', category: 'it-cyber'},
  {id: 'comptia-network-professional-certificate', category: 'it-cyber'},
  {id: 'comptia-security-professional-certificate', category: 'it-cyber'},
  {id: 'cybersecurity-professional-certificate-google', category: 'it-cyber'},
  {id: 'it-automation-with-python-google', category: 'it-cyber'},
  {id: 'aws-cloud-technology-amazon', category: 'cloud-data'},
  {id: 'data-analytics-professional-certificate-google', category: 'cloud-data'},
  {id: 'data-science-professional-certificate-ibm', category: 'cloud-data'},
  {id: 'software-developer-professional-certificate-ibm', category: 'ai-software'},
  {id: 'ai-professional-developer-certificate-ibm', category: 'ai-software'},
  {id: 'ai-practitioner-professional-certificate-aws', category: 'ai-software'},
  {id: 'project-management-professional-certificate-microsoft', category: 'business'},
  {id: 'digital-marketing-e-commerce-google', category: 'business'},
  {id: 'ux-design-professional-certificate-google', category: 'business'},
  {id: 'health-information-technology-mchit', category: 'healthcare'},
  {id: 'certified-production-technician-cpt', category: 'manufacturing'},
  {id: 'certified-logistics-technician-clt', category: 'manufacturing'},
  {id: 'core-construction-training-certificate', category: 'construction'}
];
