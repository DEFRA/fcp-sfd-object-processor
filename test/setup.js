// Test setup: provide minimal environment variables required by convict config
process.env.CDP_UPLOADER_URL = process.env.CDP_UPLOADER_URL || 'http://localhost:3000'
process.env.CDP_UPLOADER_DOCUMENT_TYPES = process.env.CDP_UPLOADER_DOCUMENT_TYPES || 'Business_Structure_Change,CS_Agreement_Amendment,CS_Revenue_Claim_Amendment,CS_Facilitation_Fund_Amendment,ES_Agreement_Amendment,Delinked_Amendment,GS_Calf_Housing_Amendment,GS_FETF_Amendment,GS_GHE_Amendment,GS_IFP_Amendment,GS_Laying_Hens_Amendment,GS_SAF_Amendment,GS_SIG_Amendment,GS_TSRS_Amendment,GS_Water_Management_Amendment,GS_WRF_Amendment,ES_Claim,GS_Adding_Value_Claim,GS_Calf_Housing_Claim,GS_FETF_Claim,GS_GHE_Claim,GS_IFP_Claim,GS_Laying_Hens_Claim,GS_SAF_Claim,GS_SIG_Claim,GS_TSRS_Claim,GS_Water_Management_Claim,GS_WRF_Claim,CS_Application_Declaration,GS_SIG_Declaration,CS_Application_Evidence,CS_Agreement_Evidence,CS_Revenue_Claim_Evidence,CS_Capital_Claim_Evidence,CS_Facilitation_Fund_Evidence,SFI_Pilot_Evidence,SFI23_Evidence,SFI_Expanded_Offer_Evidence,ES_Claim_Evidence,Delinked_Evidence,Probate_Evidence,Complaint_Evidence,Appeal_Evidence,GS_Adding_Value_Evidence,GS_Calf_Housing_App_Form,GS_Calf_Housing_App_Evidence,GS_Calf_Housing_AEL&D_Form,GS_Calf_Housing_AEL&D_Evidence,GS_Calf_Housing_Grant_Fund_Agg,GS_Calf_Housing_Claim_Evidence,GS_FETF_Grant_Fund_Agg,GS_FETF_Claim_Evidence,GS_GHE_Claim_Evidence,GS_IFP_Grant_Fund_Agg,GS_IFP_Claim_Evidence,GS_Laying_Hens_App_Form,GS_Laying_Hens_App_Evidence,GS_Laying_Hens_Grant_Fund_Agg,GS_Laying_Hens_Claim_Evidence,GS_SAF_Claim_Evidence,GS_SIG_App_General,GS_SIG_App_Evidence,GS_SIG_SSL&D_Form,GS_SIG_SSL&D_Evidence,GS_SIG_Grant_Fund_Agg,GS_SIG_Claim_Evidence,GS_TSRS_Claim_Evidence,GS_Water_Management_Claim_Evidence,GS_WRF_Claim_Evidence,CS_HT_APP_Evidence_No_Maps,CS_HT_APP_Evidence_Includes_Maps'
process.env.CDP_UPLOADER_S3_BUCKET = process.env.CDP_UPLOADER_S3_BUCKET || 'test-bucket'
process.env.CDP_UPLOADER_S3_PATH = process.env.CDP_UPLOADER_S3_PATH || 'test/path'
process.env.CDP_UPLOADER_CALLBACK_URL = process.env.CDP_UPLOADER_CALLBACK_URL || 'http://localhost:3000/callback'
process.env.CDP_UPLOADER_MAX_FILE_SIZE = process.env.CDP_UPLOADER_MAX_FILE_SIZE || '10485760'
process.env.MONGO_READ_PREFERENCE = process.env.MONGO_READ_PREFERENCE || 'primary'
// Set the topic ARN used by tests to the expected value
process.env.DOCUMENT_UPLOAD_EVENTS_TOPIC_ARN = 'arn:aws:sns:eu-west-2:000000000000:fcp_sfd_object_processor_events'
process.env.AUDIT_TOPIC_ARN = process.env.AUDIT_TOPIC_ARN || 'arn:aws:sns:eu-west-2:000000000000:fcp_audit_fcp_sfd_object_processor'

// Other optional defaults to avoid validation failures in tests
process.env.AWS_REGION = process.env.AWS_REGION || 'eu-west-2'
process.env.SNS_ENDPOINT = process.env.SNS_ENDPOINT || 'https://sns.eu-west-2.amazonaws.com'

// AWS credentials and S3 settings used by unit tests
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'test'
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'test'
process.env.AWS_S3_FORCE_PATH_STYLE = process.env.AWS_S3_FORCE_PATH_STYLE || 'true'
process.env.S3_ENDPOINT = process.env.S3_ENDPOINT || ''

export { }
