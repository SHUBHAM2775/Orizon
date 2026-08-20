import Papa from "papaparse";

export type UploadData = Record<string, any>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: any;
}

const REQUIRED_FIELDS = [
  "applicant_ref",
  "age",
  "employment_type",
  "requested_amount",
  "tenure_months",
  "monthly_income",
  "cibil_score",
  "existing_emi",
  "avg_bank_balance",
  "bounce_count",
  "last_default",
  "income_trend",
  "assets_value"
];

export function validateApplicantData(data: UploadData): ValidationResult {
  const errors: string[] = [];
  const parsedData: UploadData = {};

  // Check required fields presence
  for (const field of REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null || data[field] === "") {
      errors.push(`Missing required field: ${field}`);
    } else {
      parsedData[field] = data[field];
    }
  }

  if (errors.length > 0) return { valid: false, errors };

  // Convert types and check constraints
  const age = Number(parsedData.age);
  if (isNaN(age) || age < 0) errors.push("age must be a number >= 0");
  else parsedData.age = age;

  const reqAmt = Number(parsedData.requested_amount);
  if (isNaN(reqAmt) || reqAmt < 0) errors.push("requested_amount must be a number >= 0");
  else parsedData.requested_amount = reqAmt;

  const tenure = Number(parsedData.tenure_months);
  if (isNaN(tenure) || tenure < 0) errors.push("tenure_months must be a number >= 0");
  else parsedData.tenure_months = tenure;

  const income = Number(parsedData.monthly_income);
  if (isNaN(income) || income < 0) errors.push("monthly_income must be a number >= 0");
  else parsedData.monthly_income = income;

  const cibil = Number(parsedData.cibil_score);
  if (isNaN(cibil) || cibil < 0 || cibil > 900) errors.push("cibil_score must be between 0 and 900");
  else parsedData.cibil_score = cibil;

  const emi = Number(parsedData.existing_emi);
  if (isNaN(emi) || emi < 0) errors.push("existing_emi must be a number >= 0");
  else parsedData.existing_emi = emi;

  const bankBal = Number(parsedData.avg_bank_balance);
  if (isNaN(bankBal) || bankBal < 0) errors.push("avg_bank_balance must be a number >= 0");
  else parsedData.avg_bank_balance = bankBal;

  const bounce = Number(parsedData.bounce_count);
  if (isNaN(bounce) || bounce < 0) errors.push("bounce_count must be a number >= 0");
  else parsedData.bounce_count = bounce;

  const assets = Number(parsedData.assets_value);
  if (isNaN(assets) || assets < 0) errors.push("assets_value must be a number >= 0");
  else parsedData.assets_value = assets;

  // Boolean handling for last_default
  const lastDef = String(parsedData.last_default).toLowerCase();
  if (lastDef === "true" || lastDef === "1" || lastDef === "yes") parsedData.last_default = true;
  else if (lastDef === "false" || lastDef === "0" || lastDef === "no") parsedData.last_default = false;
  else errors.push("last_default must be a boolean (true/false)");

  // Enum handling for income_trend
  const trend = String(parsedData.income_trend).toUpperCase();
  if (!["UP", "DOWN", "FLAT"].includes(trend)) {
    errors.push("income_trend must be UP, DOWN, or FLAT");
  } else {
    parsedData.income_trend = trend;
  }

  // employment_type is string
  parsedData.employment_type = String(parsedData.employment_type);
  parsedData.applicant_ref = String(parsedData.applicant_ref);

  return {
    valid: errors.length === 0,
    errors,
    data: errors.length === 0 ? parsedData : undefined
  };
}

export function parseCSV(file: File): Promise<ValidationResult> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          resolve({ valid: false, errors: results.errors.map((e) => e.message) });
          return;
        }

        if (results.data.length === 0) {
          resolve({ valid: false, errors: ["CSV file is empty."] });
          return;
        }
        
        // For this demo, we only handle one record per upload file
        const record = results.data[0] as UploadData;
        resolve(validateApplicantData(record));
      },
      error: (error) => {
        resolve({ valid: false, errors: [error.message] });
      }
    });
  });
}

export async function parseJSON(file: File): Promise<ValidationResult> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Support array of 1 or just object
    const record = Array.isArray(data) ? data[0] : data;
    if (!record) {
      return { valid: false, errors: ["JSON file is empty."] };
    }

    return validateApplicantData(record);
  } catch (error: any) {
    return { valid: false, errors: [`Invalid JSON: ${error.message}`] };
  }
}
