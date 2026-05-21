import { useMemo, useState } from 'react'
import { Editor } from '@tinymce/tinymce-react'
import {
  Accessibility,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileCheck2,
  FileUp,
  FileText,
  Languages,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  PanelLeftClose,
  SearchCheck,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import './App.css'

type Section = {
  id: string
  number: string
  title: string
  level: number
  required: boolean
  locked?: boolean
  defaultContent: string
}

type MetadataField = {
  id: string
  label: string
  value: string
  required: boolean
  help: string
}

type ComplianceIssue = {
  id: string
  severity: 'error' | 'warning'
  label: string
  detail: string
}

type SpecFinding = {
  severity: 'error' | 'warning' | 'info'
  label: string
  detail: string
  evidence?: string | null
}

type SpecComparisonReport = {
  passed: boolean
  score: number
  similarity: number
  coverage: number
  required_terms_found: string[]
  required_terms_missing: string[]
  missing_snippets: string[]
  order_findings: SpecFinding[]
  spec_word_count: number
  document_word_count: number
  review_note: string
  created_at: string
}

type ServerExportArtifact = {
  format: 'html' | 'pdf'
  filename: string
  media_type: string
  bytes_written: number
  download_url: string
}

type AiReviewFinding = {
  severity: 'critical' | 'major' | 'minor' | 'info'
  category: 'content' | 'structure' | 'accessibility' | 'pdf_readiness' | 'metadata'
  issue: string
  recommendation: string
  evidence?: string | null
}

type AiSpecReviewReport = {
  available: boolean
  model?: string | null
  verdict: 'pass' | 'needs_review' | 'blocked' | 'unavailable'
  confidence: number
  summary: string
  findings: AiReviewFinding[]
  next_steps: string[]
  created_at: string
}

const metadataSeed: MetadataField[] = [{"id": "documentType", "label": "Document type", "value": "Summary of Benefits", "required": true, "help": "CMS model material category"}, {"id": "planYear", "label": "Plan year", "value": "2026", "required": true, "help": "Required for model-year traceability"}, {"id": "planName", "label": "Plan name", "value": "UHC Dual Complete IA-S001 (HMO-POS D-SNP)", "required": true, "help": "Member-facing plan identity"}, {"id": "contractNumber", "label": "Contract number", "value": "H0169-001-000", "required": true, "help": "CMS contract/package identifier"}, {"id": "materialId", "label": "Material ID", "value": "Y0066_SB_H0169_001_000_2026_M", "required": true, "help": "Source material identifier from the marked-up SB spec"}, {"id": "language", "label": "Document language", "value": "en-US", "required": true, "help": "Language metadata for export"}]

const sectionSeed: Section[] = [{"id": "cover", "number": "Cover", "title": "Summary of Benefits 2026", "level": 1, "required": true, "locked": true, "defaultContent": "<p>Summary of</p><p>Benefits 2026</p><p>UHC Dual Complete IA-S001 (HMO-POS D-SNP)</p><p>H0169-001-000</p><p>Look inside to learn more about the plan and the health and drug services it covers.</p><p>Contact us for more information about the plan.</p><p>1.36 .in</p><p>UHC.com/CommunityPlan</p><p>Toll-free 1-844-560-4944, TTY 711</p><p>8 a.m.-8 p.m. local time, 7 days a week</p><p>Y0066_SB_H0169_001_000_2026_M</p>"}, {"id": "intro-premium-limits", "number": "SB 1", "title": "Summary period, premium, deductible, and limits", "level": 1, "required": true, "defaultContent": "<p>Summary of Benefits</p><p>January 1, 2026 - December 31, 2026</p><p>This is a summary of what we cover and what you pay. For a complete list of covered services,</p><p>limitations and exclusions, review the Evidence of Coverage (EOC) at myUHC.com/CommunityPlan</p><p>or call Customer Service for help. After you enroll in the plan, you will get more information on how to</p><p>view your plan details online.</p><p>UHC Dual Complete IA-S001 (HMO-POS D-SNP)</p><p>Medical premium, deductible and limits</p><p>Monthly plan premium $0</p><p>You may need to continue to pay your Medicare Part B</p><p>premium</p><p>Part B premium reduction Up to $0.90</p><p>If your Medicare Part B premium is paid by Medicaid, or others</p><p>on your behalf, you will not see the reduction.</p><p>Annual medical deductible This plan does not have a medical deductible.</p><p>Maximum out-of-pocket amount(does $0</p><p>not include prescription drugs)</p><p>This is the most you will pay out-of-pocket each year for</p><p>Medicare-covered services and supplies received from network</p><p>providers.</p><p>Medicare cost-sharing If you have full Medicaid benefits or are a Qualified</p><p>Medicare Beneficiary (QMB), you will pay $0 for your</p><p>Medicare-covered services as noted by the cost-sharing in</p><p>this chart.</p>"}, {"id": "medical-benefits", "number": "SB 2", "title": "Medical benefits", "level": 1, "required": true, "defaultContent": "<h3>Medical benefits</h3><p>Service Sub-Services</p><p>Inpatient hospital care2 $0 copay per stay</p><p>Our plan covers an unlimited number of</p><p>days for an inpatient hospital stay.</p><h3>Medical benefits</h3><p>Service Sub-Services</p><p>Outpatient hospital Ambulatory $0 copay</p><p>surgical center</p><p>(ASC)2</p><p>Outpatient</p><p>hospital, including</p><p>surgery2 $0 copay</p><p>Outpatient hospital $0 copay</p><p>observation</p><p>services2</p><p>Doctor visits Primary care $0 copay</p><p>provider</p><p>Specialists1,2 $0 copay</p><p>Virtual medical $0 copay to talk with anetwork telehealth provider online</p><p>visits through live audio and video</p><p>Preventive Routine physical $0 copay, 1 per year</p><p>services</p><p>Medicare-covered $0 copay</p><ul><li>Abdominal aortic aneurysm screening</li><li>Alcohol misuse counseling</li><li>Annual wellness visit</li><li>Bone mass measurement</li><li>Breast cancer screening (mammogram)</li><li>Cardiovascular disease (behavioral therapy)</li><li>Cardiovascular screening</li><li>Cervical and vaginal cancer screening</li><li>Colorectal cancer screenings (colonoscopy, fecal occult blood test, flexible</li></ul><p>sigmoidoscopy)</p><ul><li>Depression screening</li><li>Diabetes screenings and monitoring</li><li>Hepatitis C screening</li><li>HIV screening</li><li>Lung cancer with low dose computed tomography (LDCT) screening</li><li>Medical nutrition therapy services</li></ul><h3>Medical benefits</h3><p>Service Sub-Services</p><ul><li>Medicare Diabetes Prevention Program (MDPP)</li><li>Obesity screenings and counseling</li><li>Prostate cancer screenings (PSA)</li><li>Sexually transmitted infections screenings and counseling</li><li>Tobacco use cessation counseling (counseling for people with no sign of tobacco-</li></ul><p>related disease)</p><ul><li>Vaccines, including those for the flu, Hepatitis B, pneumonia, or COVID-19</li><li>“Welcome to Medicare” preventive visit (one-time)</li></ul><p>Any additional preventive services approved by Medicare during the contract year</p><p>will be covered.</p><p>This plan covers preventive care screenings and annual physical exams at</p><p>100%when you use in-network providers.</p><p>Emergency care $0 copay (worldwide) per visit. If you are admitted to the</p><p>hospital within 24 hours, you pay the inpatient hospital copay</p><p>instead of the Emergency Care copay. See the “Inpatient</p><p>Hospital Care” section of this booklet for other costs.</p><p>Urgently needed $0 copay (worldwide) per visit</p><p>services</p><p>Diagnostic tests, Diagnostic $0 copay</p><p>lab and radiology radiology services</p><p>services, and X- (e.g. MRI, CT</p><p>rays scan)2</p><p>Lab services2 $0 copay</p><p>Diagnostic tests $0 copay</p><p>and procedures2</p><p>Therapeutic $0 copay</p><p>radiology2</p><p>Outpatient X-rays2 $0 copay</p><p>Hearing services Exam to diagnose $0 copay</p><p>and treat hearing</p><p>and balance</p><p>issues2</p><p>Routine hearing $0 copay for a routine hearing exam to help support hearing</p><p>exam health</p><h3>Medical benefits</h3><p>Service Sub-Services</p><p>Hearing aids2</p><p>$2,200 allowance for 2 hearing aids every 2 years</p><ul><li>A broad selection of over-the-counter (OTC), high-value and</li></ul><p>brand-name prescription hearing aids</p><ul><li>Access to one of the largest national networks of hearing</li></ul><p>professionals with more than 6,500 locations</p><ul><li>3-year manufacturer warranty on all prescription hearing</li></ul><p>aids covers a trial period and damage or repair during</p><p>warranty period</p><ul><li>Hearing aids purchased outside of UnitedHealthcare Hearing</li></ul><p>are not covered</p><p>Routine dental Preventiveand</p><p>benefits comprehensive • No annual deductible</p><p>services2 • Access to one of the largest national dental networks</p><p>Covered in and • Freedom to see any dentist</p><p>out-of-network.</p><p>Vision services Exam to diagnose $0 copay</p><p>and treat diseases</p><p>and conditions of</p><p>the eye2</p><p>Eyewear after $0 copay</p><p>cataract surgery</p><p>Routine eye exam $0 copayment for a routine eye exam each year to help protect</p><p>your eyesight and health</p><p>Routine eyewear</p><p>$250 allowance every year for 1 pair of frames or contacts</p><ul><li>Free standard prescription lenses including single vision,</li></ul><p>bifocals, trifocals and Tier I (standard) progressives —all with</p><p>scratch-resistant coating</p><ul><li>Access to one of Medicare Advantage’s largest national</li></ul><p>networks of vision providers and retail providers</p><ul><li>Eyewear available from many online providers, including</li></ul><p>Warby Parker and GlassesUSA</p><ul><li>You are responsible for all eyewear costs from providers</li></ul><p>outside of the UnitedHealthcare Vision network</p><p>Mental health Inpatient visit2</p><p>Our plan covers 90 $0 copay per stay</p><p>days for an</p><p>inpatient hospital</p><p>stay</p><h3>Medical benefits</h3><p>Service Sub-Services</p><p>Outpatient group $0 copay</p><p>therapy visit2</p><p>Outpatient $0 copay</p><p>individual therapy</p><p>visit2</p><p>Virtual mental $0 copay to talk with a network telehealth provider online</p><p>health visits through live audio and video</p><p>Skilled nursing facility (SNF)2 $0 copay per day: days 1-100</p><p>(Stay must meet Medicare coverage</p><p>criteria)</p><p>Our plan covers up to 100 days in a</p><p>SNF.</p><p>Outpatient Physical therapy $0 copay</p><p>rehabilitation and speech and</p><p>services language therapy</p><p>visit</p><p>Occupational $0 copay</p><p>Therapy Visit1,2</p><p>Ambulance2 $0 copay for ground</p><p>Your provider must obtain prior $0 copay for air</p><p>authorization for non-emergency</p><p>transportation.</p><p>Routine transportation</p><p>Not covered</p><p>Medicare Part B Chemotherapy $0 copay</p><p>prescription drugs drugs2</p><p>Part B covered $0 copay</p><p>insulin2</p><p>Other Part B $0 copay</p><p>drugs2</p><p>Part B drugs may</p><p>be subject to Step</p><p>Therapy. See your</p><p>Evidence of</p><h3>Medical benefits</h3>"}, {"id": "prescription-drugs", "number": "SB 3", "title": "Prescription drug payment stages and prescription drugs", "level": 1, "required": true, "defaultContent": "<p>Service Sub-Services</p><p>Coverage for</p><p>details.</p><h3>Prescription drug payment stages</h3><p>Costs shown as copay ($) or coinsurance (% of the cost)</p><p>Catastrophic Once you&#x27;re in this stage, you won&#x27;t pay anything for your Medicare-covered Part D</p><p>Coverage drugs for the rest of the plan year.</p><h3>Prescription drugs</h3><p>If you don’t qualify for Low-Income Subsidy (LIS), you pay the Medicare Part D cost-share</p><p>outlined in the Evidence of Coverage. If you do qualify for Low-Income Subsidy (LIS) you pay:</p><p>Deductible Your deductible amount is $0.</p><p>30-day or 100-day supply from a retail network</p><p>Drug coverage</p><p>pharmacy</p><p>$0, $1.60, or $5.10 copay</p><p>Drugs that are in Tier 1 are always $0 copay.</p><p>Generic (including brand drugs treated as generic)</p><p>(Some covered drugs are limited to a 30-day</p><p>supply)</p><p>$0, $4.90, or $12.65 copay</p><p>Drugs that are in Tier 1 are always $0 copay.</p><p>All other drugs3</p><p>(Some covered drugs are limited to a 30-day</p><p>supply)</p><p>Once you&#x27;re in this stage, you won&#x27;t pay anything</p><p>Catastrophic Coverage for your Medicare-covered Part D drugs for the rest</p><p>of the plan year.</p><p>Members living in long-term care facilities pay the same for a 31-day supply as a 30-day supply at a retail</p><p>pharmacy.</p>"}, {"id": "additional-benefits", "number": "SB 4", "title": "Additional benefits", "level": 1, "required": true, "defaultContent": "<p>3You pay no more than 25% of the total drug cost or a $35 copay, whichever is lower, for each 1-month</p><p>supply of Part D covered insulin drugs, even if you haven’t paid your deductible, until you reach the</p><p>Catastrophic Coverage stage where you pay $0.</p><h3>Additional benefits</h3><p>Service Sub-Services</p><p>Chiropractic Medicare-covered $0 copay</p><p>services chiropractic care</p><p>(manual manipulation</p><p>of the spine to correct</p><p>subluxation)2</p><p>Diabetes Diabetes monitoring $0 copay</p><p>management supplies2 We only cover Contour® and Accu-Chek® brands. Other</p><p>brands are not covered by your plan.</p><p>Covered glucose monitors include: Contour Plus Blue,</p><p>Contour Next EZ, Contour Next Gen, Contour Next One,</p><p>Accu-Chek Guide Me and Accu-Chek Guide.</p><p>Test strips: Contour, Contour Plus, Contour Next, Accu-</p><p>Chek Guide and Accu-Check Aviva Plus.</p><p>Diabetes self- $0 copay</p><p>management training</p><p>Therapuetic shoes or $0 copay</p><p>inserts2</p><p>Durable medical DME (e.g., $0 copay</p><p>equipment (DME) wheelchairs,oxygen)2</p><p>and related</p><p>supplies Prosthetics (e.g., $0 copay</p><p>braces, artificial</p><p>limbs)2</p><p>Fitness program $0 copay</p><p>Your fitness program helps you stay active and connected at</p><p>the gym, from home or in your community. It&#x27;s available to</p><p>you at no cost and includes:</p><ul><li>Free gym membership at core locations</li><li>Access to a large national network of gyms and fitness</li></ul><p>locations</p><ul><li>On-demand workout videos and live streaming fitness</li></ul><p>classes</p><ul><li>Online memory fitness activities</li></ul><p>Foot Care Foot exams and $0 copay</p><p>(podiatry treatment2</p><p>services)</p><p>Routine foot care $0 copayment, 6 visits per</p><p>year</p><h3>Additional benefits</h3><p>Service Sub-Services</p><p>Meal benefit2 $0 copay for 28 home-delivered meals immediately after an</p><p>inpatient hospitalization or skilled nursing facility (SNF)</p><p>stay.</p><p>Home health care2 $0 copay</p><p>Hospice You pay nothing for hospice care from any Medicare-</p><p>approved hospice. You may have to pay part of the costs for</p><p>drugs and respite care. Hospice is covered by Original</p><p>Medicare, outside of our plan.</p><p>Opioid treatment program services2 $0 copay</p><p>Outpatient Outpatient group $0 copay</p><p>substance use therapy visit2</p><p>disorder services</p><p>Outpatient individual $0 copay</p><p>therapy visit2</p><p>OTC, healthy food, utilities + wellness $179 credit every month for over-the-counter (OTC)</p><p>support products and wellness support, plus healthy food and</p><p>utilities for qualifying members</p><ul><li>Choose from thousands of OTC products, like first aid</li></ul><p>supplies, pain relievers and more</p><ul><li>Buy healthy foods like fruits, vegetables, meat, seafood,</li></ul><p>dairy products and water</p><ul><li>Shop at thousands of participating stores, including</li></ul><p>Walmart, Walgreens and Dollar General, or at neighborhood</p><p>stores near you</p><ul><li>Pay home utilities like electricity, heat, water and internet</li></ul>"}, {"id": "medicaid-deductible", "number": "SB 5", "title": "Medicaid benefits and plan deductible", "level": 1, "required": true, "defaultContent": "<p>management coaching, respite care, select fitness items and</p><p>more</p><p>Renal dialysis2 $0 copay</p><p><strong>Optional supplemental benefits</strong></p><h3>Medicaid Benefits</h3><p>Information for people with Medicare and Medicaid. Your services are paid first by Medicare and then by</p><p>Medicaid.</p><p>The benefits described below are covered by Medicaid. You can see what Department of Human Services</p><p>covers and what our plan covers.</p><p>Coverage of the benefits depends on your level of Medicaid eligibility. If Medicare doesn&#x27;t cover a</p><p>service or a benefit has run out, Medicaid may help, but you may have to pay a cost share. In some</p><p>situations, Medicaid may pay your Medicare cost sharing amount. See your Medicaid Member Handbook</p><p>for more details. If you have questions about your Medicaid eligibility and what benefits you are entitled to,</p><p>call Department of Human Services, 1-800-338-8366 .</p><h3>Plan deductible</h3><p>Your plan has a deductible for certain services. The benefit information provided is a summary of</p><p>what we cover and what you pay. It doesn’t list every service that we cover or list every limitation</p><p>or exclusion. The Evidence of Coverage (EOC) provides a complete list of services we cover.</p><p>The deductible applies to the following Medicare-covered benefit categories, unless otherwise</p><p>specified.</p><p>Annual medical deductible</p><p>Your deductible is per year for covered medical services you receive from providers as described</p><p>below. Until you have paid the deductible amount, you must pay the full cost of your covered</p><p>medical services.</p><p>Here’s how it works:</p><p>1. You pay your plan’s deductible in full; then,</p><p>2. You pay your copay or coinsurance; finally,</p><p>3. Your plan pays the rest.</p><p>The deductible applies in-network to the following Medicare-covered benefit categories, unless</p><p>otherwise specified:</p><p><strong>In-network</strong></p><p><strong>List of applicable services</strong></p><p>Outpatient</p><p>hospital</p><ul><li>Ambulatory surgical center (ASC), excluding diagnostic colonoscopy</li><li>Outpatient hospital, including surgery, excluding diagnostic colonoscopy</li><li>Outpatient hospital observation services</li></ul><p>Doctor visits</p><ul><li>Primary</li><li>Specialists</li></ul><p>Diagnostic tests, lab and radiology services, and X-rays</p><ul><li>Diagnostic radiology services (e.g. MRI)</li><li>Lab services</li><li>Diagnostic tests and procedures</li><li>Therapeutic radiology</li><li>Outpatient X-rays</li></ul><p>Hearing services</p><ul><li>Exam to diagnose and treat hearing and balance issues</li></ul><p>Vision services</p><ul><li>Exam to diagnose and treat diseases and conditions of the eye</li><li>Eyewear after cataract surgery</li></ul><p>Mental health</p><ul><li>Outpatient group therapy visit</li><li>Outpatient individual therapy visit</li></ul><p>Physical therapy and speech and language therapy visit</p><p>Ambulance</p><p>Medicare Part B drugs</p><ul><li>Chemotherapy drugs</li><li>Other Part B drugs</li></ul><p>Chiropractic services</p><ul><li>Manual manipulation of the spine to correct subluxation</li></ul><p>Diabetes management</p><ul><li>Diabetes monitoring supplies</li><li>Therapeutic shoes or inserts</li></ul><p>Durable medical equipment (DME) and related supplies</p><ul><li>Durable medical equipment (e.g. wheelchairs, oxygen)</li><li>Prosthetics (e.g., braces, artificial limbs)</li></ul><p>Foot care (podiatry services)</p><ul><li>Foot exams and treatment</li></ul>"}, {"id": "about-network", "number": "SB 6", "title": "About this plan and network providers", "level": 1, "required": true, "defaultContent": "<p>Occupational therapy visit</p><p>Opioid treatment program services</p><p>Outpatient substance use disorder services</p><ul><li>Outpatient group therapy visit</li><li>Outpatient individual therapy visit</li></ul><p>Renal dialysis</p><h3>About this plan</h3><p>UHC Dual Complete IA-S001 (HMO-POS D-SNP) is a Medicare Advantage HMOPOS plan with a</p><p>Medicare contract.</p><p>To join this plan, you must be entitled to Medicare Part A, be enrolled in Medicare Part B, live within our</p><p>service area listed below, and be a United States citizen or lawfully present in the United States.</p><p>This plan is a Dual Eligible Special Needs Plan (D-SNP) for people who have both Medicare and Medicaid,</p><p>and don’t pay anything for covered medical services. How much Medicaid covers depends on your income,</p><p>resources, and other factors. Some people get full Medicaid benefits.</p><p>Your eligibility to enroll in this plan depends on your type of Medicaid.</p><p>You can enroll in this plan if you are in one of these Medicaid categories:</p><ul><li>Qualified Medicare Beneficiary Plus (QMB+): You get Medicaid coverage of Medicare cost-</li></ul><p>share and are also eligible for full Medicaid benefits. Medicaid pays your Part A and Part B</p><p>premiums, deductibles, coinsurance, and copayment amounts for Medicare covered services.</p><p>You pay nothing, except for Part D prescription drug copays.</p><ul><li>Qualified Medicare Beneficiary (QMB): You get Medicaid coverage of Medicare cost-share but</li></ul><p>are not eligible for full Medicaid benefits. Medicaid pays your Part A and Part B premiums,</p><p>deductibles, coinsurance, and copayment amounts only for Medicare covered services. You pay</p><p>nothing, except for Part D prescription drug copays.</p><ul><li>Specified Low-Income Medicare Beneficiary (SLMB+): Medicaid pays your Part B premium</li></ul><p>and provides full Medicaid benefits. You are eligible for full Medicaid benefits. At times you may</p><p>also be eligible for limited assistance from your state Medicaid agency in paying your Medicare</p><p>cost share amounts. Generally your cost share is 0% when the service is covered by both</p><p>Medicare and Medicaid. There may be cases where you have to pay cost sharing when a service</p><p>or benefit is not covered by Medicaid.</p><ul><li>Full Benefits Dual Eligible (FBDE): Medicaid may provide limited assistance with Medicare cost-</li></ul><p>sharing. Medicaid also provides full Medicaid benefits. You are eligible for full Medicaid benefits.</p><p>At times you may also be eligible for limited assistance from the State Medicaid Office in paying</p><p>your Medicare cost share amounts. Generally your cost share is 0% when the service is covered</p><p>by both Medicare and Medicaid. There may be cases where you have to pay cost sharing when a</p><p>service or benefit is not covered by Medicaid.</p><p>If your category of Medicaid eligibility changes, your cost share may also increase or decrease. You must</p><p>recertify your Medicaid enrollment to continue to receive your Medicare coverage.</p><h3>Use network providers and pharmacies</h3>"}, {"id": "required-info", "number": "SB 7", "title": "Required information and benefit disclosures", "level": 1, "required": true, "locked": true, "defaultContent": "<p>health plan requires you to select a primary care provider (PCP) from the network. Your PCP can</p><p>handle most routine health care needs and will be responsible to coordinate your care. If you need to</p><p>see a network specialist or other network provider, you may need to get a referral from your PCP. We</p><p>encourage you to find out which specialists and hospitals your PCP would recommend for you and</p><p>would refer you to for care, prior to selecting them as your plan’s PCP. If you use pharmacies that are</p><p>not in our network , the plan may not pay for those drugs, or you may pay more than you pay at a</p><p>network pharmacy.</p><p>You can go to UHC.com/CommunityPlan to search for a network provider or pharmacy using the</p><p>online directories . You can also view the plan Drug List (Formulary) to see what drugs are covered and</p><p>if there are any restrictions.</p><h3>Required Information</h3><p>UHC Dual Complete IA-S001 (HMO-POS D-SNP) is insured through UnitedHealthcare Insurance Company or</p><p>one of its affiliated companies, a Medicare Advantage organization with a Medicare contract and a contract with</p><p>the State Medicaid Program. Enrollment in the plan depends on the plan’s contract renewal with Medicare .</p><p>Plans may offer supplemental benefits in addition to Part C benefits and Part D benefits.</p><p>If you want to know more about the coverage and costs of Original Medicare, look in your current “Medicare &amp;</p><p>You” handbook. View it online at medicare.gov or get a copy by calling 1-800-MEDICARE (1-800-633-4227), 24</p><p>hours a day, 7 days a week. TTY users should call 1-877-486-2048.</p><p>UnitedHealthcare does not discriminate on the basis of race, color, national origin, sex, age, or disability in</p><p>health programs and activities.</p><p>UnitedHealthcare provides free services to help you communicate with us such as documents in other</p><p>languages, Braille, large print, audio, or you can ask for an interpreter. Please contact our Customer Service</p><p>number at 1-844-368-6883 for additional information (TTY users should call 711). Hours are 8 a.m.-8 p.m.: 7</p><p>Days Oct-Mar; M-F Apr-Sept.</p><p>UnitedHealthcare ofrece servicios gratuitos para ayudarle a que se comunique con nosotros. Por ejemplo,</p><p>documentos en otros idiomas, braille, letra grande, audio o bien, usted puede pedir un intérprete. Comuníquese</p><p>con nuestro número de Servicio al Cliente al 1-844-368-6883, para obtener información adicional (los usuarios</p><p>de TTY deben comunicarse al 711). Los horarios de atención son de 8 a.m. a 8 p.m.: los 7 días de la semana,</p><p>de octubre a marzo; de lunes a viernes, de abril a septiembre.</p><p>Benefits, features, and/or devices vary by plan/area. Limitations, exclusions and/or network restrictions may</p><p>apply.</p><p>Hearing aids</p><p>Other hearing exam providers are available in the UnitedHealthcare network. The plan only covers hearing aids</p><p>from a UnitedHealthcare Hearing network provider. Provider network size may vary by local market. OTC</p><p>hearing aid warranties, if available, will vary by device and are handled through the manufacturer. One-time</p><p>professional fee may apply for prescription hearing aids.</p><p>Routine dental benefits</p><p><strong>Dental services</strong> include the routine dental benefits described in this Summary of Benefits.</p><p>If your plan offers out-of-network dental coverage and you see an out-of-network dentist, you might be billed</p><p>more. Provider network may vary in local market. Dental network size based on Zelis Network360, May 2025.</p><p>Routine eyewear</p><p>Additional charges may apply for out-of-network items and services. Provider and retail network may vary in</p><p>local market. Vision network size based on Zelis Network360, March 2023. Annual routine eye exam and $100-</p><p>450 allowance for contacts or designer frames, with standard (single, bi-focal, tri-focal or standard progressive)</p><p>lenses covered in full either annually or every two years. Savings based on comparison to retail. Other vision</p><p>providers are available in our network.</p><p>Fitness program</p><p>The fitness benefit and gym network varies by plan/area and participating locations may change. The fitness</p><p>benefit includes a standard fitness membership at participating locations. Not all plans offer access to premium</p><p>locations. Consult your doctor prior to beginning an exercise program or making changes to your lifestyle or</p><p>health care routine.</p><p>CSIA26HP0332346_000</p><p>OTC, healthy food, utilities + wellness support</p><p>OTC, food and utility benefits have expiration timeframes. Review your Evidence of Coverage (EOC) for more</p><p>information. The healthy food and utilities benefit is a special supplemental benefit only available to chronically</p><p>ill enrollees with a qualifying condition, such as diabetes, cardiovascular disorders, chronic heart failure, chronic</p><p>high blood pressure and/or chronic high cholesterol, and who also meet all applicable plan coverage criteria.</p>"}]

const workflowSteps = ['Draft', '508 preflight', 'Spec match', 'Compliance review', 'Export package']

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'https://health-doc-cms-api.onrender.com').replace(/\/$/, '')

function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

function downloadUrl(path: string) {
  return path.startsWith('http') ? path : apiUrl(path)
}

function textOnly(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function buildHtml(metadata: MetadataField[], sections: Section[], content: Record<string, string>) {
  const title = metadata.find((field) => field.id === 'documentType')?.value ?? 'CMS Document'
  const lang = metadata.find((field) => field.id === 'language')?.value ?? 'en-US'
  const metadataRows = metadata.map((field) => `<dt>${field.label}</dt><dd>${field.value || 'Not provided'}</dd>`).join('')
  const toc = sections.map((section) => `<li class="toc-level-${section.level}"><a href="#${section.id}">${section.number} ${section.title}</a></li>`).join('')
  const body = sections.map((section) => {
    const Heading = `h${Math.min(section.level + 1, 4)}`
    return `<section id="${section.id}" aria-labelledby="heading-${section.id}"><${Heading} id="heading-${section.id}">${section.number} ${section.title}</${Heading}>${content[section.id]}</section>`
  }).join('')

  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>body{font-family:Arial,Helvetica,sans-serif;line-height:1.5;max-width:7.625in;margin:0.75in auto;color:#111827}a{color:#174ea6}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #374151;padding:.45rem;text-align:left;vertical-align:top}th{background:#eef2ff}h1,h2,h3,h4{page-break-after:avoid}.metadata{display:grid;grid-template-columns:12rem 1fr;gap:.25rem 1rem}.toc-level-2{margin-left:1rem}@page{size:8.5in 11in;margin:.75in}</style></head><body><main><h1>${title}</h1><dl class="metadata">${metadataRows}</dl><nav aria-label="Document table of contents"><h2>Table of Contents</h2><ol>${toc}</ol></nav>${body}</main></body></html>`
}

function runCompliance(metadata: MetadataField[], sections: Section[], content: Record<string, string>): ComplianceIssue[] {
  const issues: ComplianceIssue[] = []
  metadata.forEach((field) => {
    if (field.required && !field.value.trim()) {
      issues.push({ id: `metadata-${field.id}`, severity: 'error', label: `${field.label} is required`, detail: 'Required metadata is needed for document identity, review, and export.' })
    }
  })
  sections.forEach((section) => {
    const html = content[section.id] ?? ''
    const plainText = textOnly(html)
    if (section.required && plainText.length < 10) {
      issues.push({ id: `section-${section.id}`, severity: 'error', label: `${section.number} is incomplete`, detail: 'Required CMS model sections must not be exported empty.' })
    }
    if (/<img\b(?![^>]*\balt=)/i.test(html)) {
      issues.push({ id: `alt-${section.id}`, severity: 'error', label: `${section.number} has an image without alt text`, detail: 'Meaningful images require alternative text before export.' })
    }
    if (/<table\b/i.test(html) && !/<th\b/i.test(html)) {
      issues.push({ id: `table-${section.id}`, severity: 'error', label: `${section.number} has a table without headers`, detail: 'Benefit and cost tables must expose header relationships.' })
    }
    if (/(>click here<|>read more<|>learn more<)/i.test(html)) {
      issues.push({ id: `link-${section.id}`, severity: 'warning', label: `${section.number} may contain vague link text`, detail: 'Links should describe their destination or action.' })
    }
    if (plainText.length > 900 && !/<h[2-4]\b/i.test(html)) {
      issues.push({ id: `long-${section.id}`, severity: 'warning', label: `${section.number} contains a long uninterrupted block`, detail: 'Long healthcare content should be broken into semantic headings, lists, or tables.' })
    }
  })
  return issues
}

function App() {
  const [metadata, setMetadata] = useState(metadataSeed)
  const [sections] = useState(sectionSeed)
  const [activeSection, setActiveSection] = useState(sectionSeed[0].id)
  const [content, setContent] = useState<Record<string, string>>(() => Object.fromEntries(sectionSeed.map((section) => [section.id, section.defaultContent])))
  const [mobileTocOpen, setMobileTocOpen] = useState(false)
  const [specFile, setSpecFile] = useState<File | null>(null)
  const [specReport, setSpecReport] = useState<SpecComparisonReport | null>(null)
  const [specStatus, setSpecStatus] = useState('Upload a marked-up SB spec PDF and compare it against the generated HTML.')
  const [isComparingSpec, setIsComparingSpec] = useState(false)
  const [aiReview, setAiReview] = useState<AiSpecReviewReport | null>(null)
  const [aiReviewStatus, setAiReviewStatus] = useState('Optional AI review is available when the backend has an AI model key configured.')
  const [isAiReviewing, setIsAiReviewing] = useState(false)
  const [serverExport, setServerExport] = useState<ServerExportArtifact | null>(null)
  const [serverExportStatus, setServerExportStatus] = useState('Server PDF export is ready when the backend is available.')
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const active = sections.find((section) => section.id === activeSection) ?? sections[0]
  const issues = useMemo(() => runCompliance(metadata, sections, content), [metadata, sections, content])
  const htmlExport = useMemo(() => buildHtml(metadata, sections, content), [metadata, sections, content])
  const errors = issues.filter((issue) => issue.severity === 'error').length
  const warnings = issues.filter((issue) => issue.severity === 'warning').length
  const specMissingCount = specReport ? specReport.required_terms_missing.length + specReport.missing_snippets.length : 0
  const completedSections = sections.filter((section) => textOnly(content[section.id] ?? '').length >= 10).length
  const readiness = Math.round(((sections.length - Math.min(errors, sections.length)) / sections.length) * 100)

  const updateMetadata = (id: string, value: string) => setMetadata((items) => items.map((item) => (item.id === id ? { ...item, value } : item)))
  const switchSection = (id: string) => {
    setActiveSection(id)
    setMobileTocOpen(false)
  }
  const downloadHtml = () => {
    const blob = new Blob([htmlExport], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'summary-of-benefits-2026.html'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const exportServerPdf = async () => {
    setIsExportingPdf(true)
    setServerExportStatus('Generating server PDF package from canonical HTML...')
    setServerExport(null)
    try {
      const response = await fetch(apiUrl('/api/v1/exports/pdf-package'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: htmlExport, filename: 'summary-of-benefits-2026.pdf' }),
      })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `PDF export failed with HTTP ${response.status}`)
      }
      const artifact = (await response.json()) as ServerExportArtifact
      setServerExport(artifact)
      setServerExportStatus(`PDF package generated: ${artifact.filename}`)
      window.open(downloadUrl(artifact.download_url), '_blank', 'noopener,noreferrer')
    } catch (error) {
      setServerExportStatus(error instanceof Error ? error.message : 'Unable to generate server PDF package.')
    } finally {
      setIsExportingPdf(false)
    }
  }

  const compareAgainstSpec = async () => {
    if (!specFile) {
      setSpecStatus('Select the marked-up SB specification PDF before running comparison.')
      return
    }
    setIsComparingSpec(true)
    setSpecStatus('Extracting spec PDF text and comparing against generated HTML...')
    setSpecReport(null)
    setAiReview(null)
    try {
      const formData = new FormData()
      formData.append('spec_file', specFile)
      formData.append('html', htmlExport)
      const response = await fetch(apiUrl('/api/v1/specs/compare-html'), { method: 'POST', body: formData })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `Spec comparison failed with HTTP ${response.status}`)
      }
      const report = (await response.json()) as SpecComparisonReport
      setSpecReport(report)
      setSpecStatus(report.passed ? 'Spec comparison passed the configured precision threshold.' : 'Spec comparison found gaps that need author or reviewer attention.')
    } catch (error) {
      setSpecStatus(error instanceof Error ? error.message : 'Unable to compare against the uploaded specification.')
    } finally {
      setIsComparingSpec(false)
    }
  }

  const runAiSpecReview = async () => {
    if (!specFile) {
      setAiReviewStatus('Select the marked-up SB specification PDF before requesting AI review.')
      return
    }
    setIsAiReviewing(true)
    setAiReviewStatus('Requesting semantic AI review of the generated HTML against the uploaded specification...')
    setAiReview(null)
    try {
      const formData = new FormData()
      formData.append('spec_file', specFile)
      formData.append('html', htmlExport)
      const response = await fetch(apiUrl('/api/v1/specs/ai-review-html'), { method: 'POST', body: formData })
      if (!response.ok) {
        const detail = await response.text()
        throw new Error(detail || `AI review failed with HTTP ${response.status}`)
      }
      const report = (await response.json()) as AiSpecReviewReport
      setAiReview(report)
      setAiReviewStatus(report.available ? `AI review completed with verdict: ${report.verdict.replace('_', ' ')}.` : report.summary)
    } catch (error) {
      setAiReviewStatus(error instanceof Error ? error.message : 'Unable to complete AI-assisted spec review.')
    } finally {
      setIsAiReviewing(false)
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to document editor</a>

      <header className="masthead" role="banner">
        <div className="brand-mark" aria-hidden="true"><Landmark size={24} /></div>
        <div>
          <p className="eyebrow">CMS.gov healthcare document CMS</p>
          <h1>Summary of Benefits precision workspace</h1>
          <p className="lede">Generate, compare, and export a Summary of Benefits document against the marked-up SB source spec with deterministic and AI-assisted review.</p>
        </div>
        <div className="masthead-actions" aria-label="Primary status and actions">
          <div className="readiness-ring" aria-label={`Export readiness ${readiness} percent`}><strong>{readiness}%</strong><span>ready</span></div>
          <button className="primary-action compact" onClick={downloadHtml}><Download size={18} aria-hidden="true" /> Export HTML</button>
        </div>
      </header>

      <section className="status-strip" aria-label="Document readiness summary">
        <article className="metric-card positive"><ShieldCheck aria-hidden="true" /><span>Preflight</span><strong>{errors === 0 ? 'Ready' : `${errors} blocker${errors === 1 ? '' : 's'}`}</strong></article>
        <article className="metric-card"><ClipboardCheck aria-hidden="true" /><span>Sections complete</span><strong>{completedSections}/{sections.length}</strong></article>
        <article className="metric-card"><AlertTriangle aria-hidden="true" /><span>Advisories</span><strong>{warnings}</strong></article>
        <article className="metric-card"><Languages aria-hidden="true" /><span>Language</span><strong>{metadata.find((field) => field.id === 'language')?.value || 'Missing'}</strong></article>
        <article className={specReport && specMissingCount === 0 ? 'metric-card positive' : 'metric-card'}><BrainCircuit aria-hidden="true" /><span>Spec match</span><strong>{specReport ? `${specReport.score}%` : 'Not run'}</strong></article>
      </section>

      <nav className="workflow" aria-label="Compliance workflow progress">
        {workflowSteps.map((step, index) => <span key={step} className={index <= 1 ? 'current' : ''}>{step}</span>)}
      </nav>

      <main id="main-content" className="workspace">
        <aside className={`sidebar ${mobileTocOpen ? 'open' : ''}`} aria-label="Document table of contents">
          <div className="panel-title-row">
            <div>
              <h2><LayoutDashboard size={20} aria-hidden="true" /> Document structure</h2>
              <p>SB sections are seeded from the uploaded marked-up source spec and remain in source order for comparison.</p>
            </div>
            <button className="icon-button mobile-only" type="button" onClick={() => setMobileTocOpen(false)} aria-label="Close document structure"><PanelLeftClose size={20} /></button>
          </div>
          <nav className="toc-list" aria-label="CMS section list">
            {sections.map((section) => (
              <button key={section.id} className={section.id === activeSection ? 'toc-item active' : 'toc-item'} style={{ marginLeft: `${(section.level - 1) * 1.1}rem` }} onClick={() => switchSection(section.id)} aria-current={section.id === activeSection ? 'step' : undefined}>
                <span className="toc-kicker">{section.number}</span>
                <strong>{section.title}</strong>
                {section.locked && <em><LockKeyhole size={13} aria-hidden="true" /> locked CMS text</em>}
              </button>
            ))}
          </nav>
        </aside>

        <section className="editor-column" aria-labelledby="editor-heading">
          <div className="mobile-commandbar">
            <button className="secondary-action compact" type="button" onClick={() => setMobileTocOpen(true)}><Menu size={18} aria-hidden="true" /> Sections</button>
            <span aria-live="polite">Editing: {active.number}</span>
          </div>

          <section className="metadata-panel" aria-labelledby="metadata-heading">
            <div className="section-heading-row compact-row">
              <div>
                <p className="eyebrow"><FileText size={16} aria-hidden="true" /> document control</p>
                <h2 id="metadata-heading">Metadata required for CMS traceability</h2>
              </div>
              <span className="assurance-badge"><SearchCheck size={16} aria-hidden="true" /> WCAG-ready labels</span>
            </div>
            <div className="metadata-grid">
              {metadata.map((field) => (
                <label key={field.id} htmlFor={field.id}>
                  <span>{field.label}{field.required ? ' *' : ''}</span>
                  <input id={field.id} value={field.value} onChange={(event) => updateMetadata(field.id, event.target.value)} aria-describedby={`${field.id}-help`} aria-required={field.required} />
                  <small id={`${field.id}-help`}>{field.help}</small>
                </label>
              ))}
            </div>
          </section>

          <section className="authoring-card" aria-labelledby="editor-heading">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">{active.number}</p>
                <h2 id="editor-heading">{active.title}</h2>
              </div>
              {active.locked && <span className="lock-badge"><LockKeyhole size={15} aria-hidden="true" /> CMS standardized text</span>}
            </div>
            <p className="instruction">Use semantic headings, accessible tables, descriptive links, and approved CMS insertions. The editor restricts formatting patterns that commonly break downstream 508/PDF quality.</p>
            <div className="editor-frame" role="region" aria-label={`${active.title} rich text editor`}>
              <Editor
                tinymceScriptSrc="/tinymce/tinymce.min.js"
                licenseKey="gpl"
                value={content[active.id]}
                onEditorChange={(value) => setContent((current) => ({ ...current, [active.id]: value }))}
                init={{
                  height: 460,
                  menubar: false,
                  branding: false,
                  plugins: 'advlist lists link image table code wordcount searchreplace visualblocks autoresize',
                  toolbar: 'undo redo | blocks | bold italic underline | bullist numlist | link image table | removeformat | visualblocks code',
                  block_formats: 'Paragraph=p; Section heading=h2; Subsection heading=h3; Minor heading=h4',
                  table_advtab: false,
                  table_cell_advtab: false,
                  table_row_advtab: false,
                  content_style: 'body{font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.6;color:#111827;margin:1rem} a{color:#174ea6;text-decoration:underline} table{border-collapse:collapse;width:100%;margin:1rem 0} th,td{border:1px solid #4b5563;padding:10px;text-align:left;vertical-align:top} th{background:#eef2ff;color:#111827} h2,h3,h4{line-height:1.25;color:#0f172a}',
                }}
              />
            </div>
          </section>
        </section>

        <aside className="compliance-panel" aria-label="Compliance preflight">
          <div className="panel-title-row">
            <div>
              <h2><Accessibility size={20} aria-hidden="true" /> 501/508 preflight</h2>
              <p>Automated checks support production quality but do not replace final Word and Acrobat accessibility verification.</p>
            </div>
          </div>
          <div className="score-grid" aria-label="Compliance issue counts">
            <span><strong>{errors}</strong> errors</span>
            <span><strong>{warnings}</strong> warnings</span>
          </div>
          <div className="issue-list" aria-live="polite" aria-relevant="additions removals">
            {issues.length === 0 ? <div className="issue passed"><CheckCircle2 size={18} aria-hidden="true" /> <span>All configured checks passed.</span></div> : issues.map((issue) => (
              <article key={issue.id} className={`issue ${issue.severity}`}>
                <AlertTriangle size={18} aria-hidden="true" />
                <div><strong>{issue.label}</strong><p>{issue.detail}</p></div>
              </article>
            ))}
          </div>
          <div className="action-stack">
            <button className="primary-action" onClick={downloadHtml}><Download size={18} aria-hidden="true" /> Export accessible HTML</button>
            <button className="secondary-action" type="button" onClick={exportServerPdf} disabled={isExportingPdf}><FileCheck2 size={18} aria-hidden="true" /> {isExportingPdf ? 'Generating PDF...' : 'Generate server PDF package'}</button>
            {serverExport && <a className="download-link" href={downloadUrl(serverExport.download_url)} target="_blank" rel="noreferrer">Download latest {serverExport.format.toUpperCase()} package</a>}
            <p className="status-text" aria-live="polite">{serverExportStatus}</p>
          </div>
          <section className="spec-review" aria-labelledby="spec-review-heading">
            <div className="panel-title-row compact-row">
              <div>
                <p className="eyebrow"><BrainCircuit size={16} aria-hidden="true" /> spec precision</p>
                <h3 id="spec-review-heading">Compare generated HTML to marked-up SB spec</h3>
              </div>
              {specReport && <span className={specReport.passed ? 'spec-score passed' : 'spec-score warning'}>{specReport.score}%</span>}
            </div>
            <label className="file-picker" htmlFor="spec-file">
              <FileUp size={18} aria-hidden="true" />
              <span>{specFile ? specFile.name : 'Choose marked-up spec PDF'}</span>
              <input id="spec-file" type="file" accept="application/pdf,.pdf" onChange={(event) => setSpecFile(event.target.files?.[0] ?? null)} />
            </label>
            <button className="secondary-action" type="button" onClick={compareAgainstSpec} disabled={isComparingSpec}><SearchCheck size={18} aria-hidden="true" /> {isComparingSpec ? 'Comparing...' : 'Run spec match'}</button>
            <button className="secondary-action ai-action" type="button" onClick={runAiSpecReview} disabled={isAiReviewing}><BrainCircuit size={18} aria-hidden="true" /> {isAiReviewing ? 'Reviewing...' : 'Run AI review'}</button>
            <p className="status-text" aria-live="polite">{specStatus}</p>
            <p className="status-text" aria-live="polite">{aiReviewStatus}</p>
            {specReport && (
              <div className="spec-results">
                <div className="score-grid compact-score">
                  <span><strong>{Math.round(specReport.coverage * 100)}%</strong> coverage</span>
                  <span><strong>{Math.round(specReport.similarity * 100)}%</strong> similarity</span>
                </div>
                <p><strong>Spec words:</strong> {specReport.spec_word_count.toLocaleString()} · <strong>Document words:</strong> {specReport.document_word_count.toLocaleString()}</p>
                {specReport.required_terms_missing.length > 0 && (
                  <article className="issue warning"><AlertTriangle size={18} aria-hidden="true" /><div><strong>Missing SB required terms</strong><p>{specReport.required_terms_missing.slice(0, 8).join(', ')}</p></div></article>
                )}
                {specReport.order_findings.map((finding) => (
                  <article key={`${finding.label}-${finding.evidence ?? 'none'}`} className={`issue ${finding.severity === 'error' ? 'error' : finding.severity === 'warning' ? 'warning' : 'passed'}`}>
                    <CheckCircle2 size={18} aria-hidden="true" />
                    <div><strong>{finding.label}</strong><p>{finding.detail}</p></div>
                  </article>
                ))}
                {specReport.missing_snippets.length > 0 && (
                  <details className="snippet-details">
                    <summary>Review missing spec snippets ({specReport.missing_snippets.length})</summary>
                    {specReport.missing_snippets.slice(0, 6).map((snippet) => <p key={snippet}>{snippet}</p>)}
                  </details>
                )}
                <p className="review-note">{specReport.review_note}</p>
              </div>
            )}
            {aiReview && (
              <div className="spec-results ai-results">
                <div className="score-grid compact-score">
                  <span><strong>{aiReview.verdict.replace('_', ' ')}</strong> verdict</span>
                  <span><strong>{Math.round(aiReview.confidence * 100)}%</strong> confidence</span>
                </div>
                <p><strong>{aiReview.available ? `AI model: ${aiReview.model ?? 'configured model'}` : 'AI unavailable'}.</strong> {aiReview.summary}</p>
                {aiReview.findings.map((finding) => (
                  <article key={`${finding.category}-${finding.issue}`} className={`issue ${finding.severity === 'critical' || finding.severity === 'major' ? 'warning' : 'passed'}`}>
                    <BrainCircuit size={18} aria-hidden="true" />
                    <div><strong>{finding.category}: {finding.issue}</strong><p>{finding.recommendation}{finding.evidence ? ` Evidence: ${finding.evidence}` : ''}</p></div>
                  </article>
                ))}
                {aiReview.next_steps.length > 0 && (
                  <details className="snippet-details" open>
                    <summary>AI reviewer next steps ({aiReview.next_steps.length})</summary>
                    {aiReview.next_steps.map((step) => <p key={step}>{step}</p>)}
                  </details>
                )}
              </div>
            )}
          </section>
          <div className="standard-note"><Sparkles size={18} aria-hidden="true" /><p><strong>WCAG-aligned UI:</strong> visible focus states, labeled inputs, keyboard targets, semantic landmarks, responsive panels, and high-contrast typography.</p></div>
        </aside>
      </main>

      <section className="preview" aria-labelledby="preview-heading">
        <div className="section-heading-row compact-row">
          <div>
            <p className="eyebrow"><ChevronRight size={16} aria-hidden="true" /> semantic output</p>
            <h2 id="preview-heading">Accessible export preview</h2>
          </div>
          <span className="assurance-badge">HTML source preview</span>
        </div>
        <iframe title="Accessible document HTML preview" srcDoc={htmlExport} />
      </section>
    </div>
  )
}

export default App
