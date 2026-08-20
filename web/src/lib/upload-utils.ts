import Papa from "papaparse";

export type UploadData = Record<string, any>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data?: any;
}

const REQUIRED_FIELDS = [
  "applicant_ref"
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

  // Helper to parse optional numbers
  const parseNum = (val: any, name: string, min: number = 0, max?: number) => {
    if (val === undefined || val === null || val === "") return undefined;
    const n = Number(val);
    if (isNaN(n) || n < min || (max !== undefined && n > max)) {
      errors.push(`${name} must be a valid number between ${min} and ${max ?? "infinity"}`);
      return undefined;
    }
    return n;
  };

  parsedData.age = parseNum(data.age, "age");
  parsedData.requested_amount = parseNum(data.requested_amount, "requested_amount");
  parsedData.tenure_months = parseNum(data.tenure_months, "tenure_months");
  parsedData.monthly_income = parseNum(data.monthly_income, "monthly_income");
  parsedData.cibil_score = parseNum(data.cibil_score, "cibil_score", 0, 900);
  parsedData.existing_emi = parseNum(data.existing_emi, "existing_emi");
  parsedData.avg_bank_balance = parseNum(data.avg_bank_balance, "avg_bank_balance");
  parsedData.bounce_count = parseNum(data.bounce_count, "bounce_count");
  parsedData.assets_value = parseNum(data.assets_value, "assets_value");

  // Boolean handling for last_default
  if (data.last_default !== undefined && data.last_default !== null && data.last_default !== "") {
    const lastDef = String(data.last_default).toLowerCase();
    if (lastDef === "true" || lastDef === "1" || lastDef === "yes") parsedData.last_default = true;
    else if (lastDef === "false" || lastDef === "0" || lastDef === "no") parsedData.last_default = false;
    else errors.push("last_default must be a boolean (true/false)");
  }

  // Enum handling for income_trend
  if (data.income_trend !== undefined && data.income_trend !== null && data.income_trend !== "") {
    const trend = String(data.income_trend).toUpperCase();
    if (!["UP", "DOWN", "FLAT"].includes(trend)) {
      errors.push("income_trend must be UP, DOWN, or FLAT");
    } else {
      parsedData.income_trend = trend;
    }
  }

  // strings
  if (data.employment_type) parsedData.employment_type = String(data.employment_type);
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
