"use client";

import { useState, useEffect } from "react";
import { validateApplicantData, type UploadData } from "@/lib/upload-utils";
import { submitApplicantAction } from "@/app/actions/upload";

interface PdfReviewFormProps {
  extractedProfile: any;
  onCancel: () => void;
  onSuccess: () => void;
}

export function PdfReviewForm({ extractedProfile, onCancel, onSuccess }: PdfReviewFormProps) {
  const [formData, setFormData] = useState<UploadData>({
    applicant_ref: "",
    age: "",
    employment_type: "",
    requested_amount: "",
    tenure_months: "",
    monthly_income: "",
    cibil_score: "",
    existing_emi: "",
    avg_bank_balance: "",
    bounce_count: "",
    last_default: "false",
    income_trend: "FLAT",
    assets_value: "",
  });

  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-fill fields based on the structured AI extraction
  useEffect(() => {
    if (!extractedProfile) return;
    
    const parsed: Partial<UploadData> = {};
    
    if (extractedProfile.applicantId) parsed.applicant_ref = extractedProfile.applicantId;
    if (extractedProfile.bureauScore) parsed.cibil_score = String(extractedProfile.bureauScore);
    if (extractedProfile.age) parsed.age = String(extractedProfile.age);
    if (extractedProfile.employmentType) parsed.employment_type = extractedProfile.employmentType;
    if (extractedProfile.requestedLoanAmount) parsed.requested_amount = String(extractedProfile.requestedLoanAmount);
    if (extractedProfile.requestedTenure) parsed.tenure_months = String(extractedProfile.requestedTenure);
    if (extractedProfile.declaredIncome) parsed.monthly_income = String(Math.round(extractedProfile.declaredIncome / 12));
    if (extractedProfile.emiDebits) parsed.existing_emi = String(extractedProfile.emiDebits);
    if (extractedProfile.bankAvgBalance || extractedProfile.bankAvgCredits) parsed.avg_bank_balance = String(extractedProfile.bankAvgBalance || extractedProfile.bankAvgCredits);
    if (extractedProfile.bounceCount) parsed.bounce_count = String(extractedProfile.bounceCount);
    if (extractedProfile.declaredAssets) parsed.assets_value = String(extractedProfile.declaredAssets);
    if (extractedProfile.writeOffFlag || extractedProfile.defaultFlag) parsed.last_default = "true";
    if (extractedProfile.incomeTrend) parsed.income_trend = extractedProfile.incomeTrend.toUpperCase();

    setFormData((prev) => ({ ...prev, ...parsed }));
  }, [extractedProfile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);
    
    const validation = validateApplicantData(formData);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    const result = await submitApplicantAction(validation.data);
    setIsSubmitting(false);

    if (result.error) {
      setErrors([result.error]);
    } else {
      onSuccess();
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
            Extracted Data
          </label>
          <div className="bg-[color-mix(in_oklch,var(--paper),var(--ink)_2%)] border border-[color-mix(in_oklch,var(--ink),transparent_85%)] rounded-[var(--radius-sm)] p-3 h-96 overflow-y-auto font-mono text-xs text-[var(--ink)] whitespace-pre-wrap">
            {JSON.stringify(extractedProfile, null, 2)}
          </div>
        </div>
        
        <div>
          <label className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)] mb-2 block">
            Review & Edit Fields
          </label>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.length > 0 && (
              <div className="bg-[color-mix(in_oklch,var(--reject),transparent_90%)] text-[var(--reject)] p-3 text-sm rounded-[var(--radius-sm)] space-y-1">
                {errors.map((err, i) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Applicant Ref">
                <input type="text" name="applicant_ref" value={formData.applicant_ref} onChange={handleChange} required className="form-input" placeholder="e.g. APP-001" />
              </FormField>
              <FormField label="Age">
                <input type="number" name="age" value={formData.age} onChange={handleChange} className="form-input" min="0" />
              </FormField>
              <FormField label="Employment Type">
                <input type="text" name="employment_type" value={formData.employment_type} onChange={handleChange} className="form-input" placeholder="Salaried / Self-Employed" />
              </FormField>
              <FormField label="Requested Amount">
                <input type="number" name="requested_amount" value={formData.requested_amount} onChange={handleChange} className="form-input" min="0" />
              </FormField>
              <FormField label="Tenure (Months)">
                <input type="number" name="tenure_months" value={formData.tenure_months} onChange={handleChange} className="form-input" min="0" />
              </FormField>
              <FormField label="Monthly Income">
                <input type="number" name="monthly_income" value={formData.monthly_income} onChange={handleChange} className="form-input" min="0" />
              </FormField>
              <FormField label="CIBIL Score">
                <input type="number" name="cibil_score" value={formData.cibil_score} onChange={handleChange} className="form-input" min="0" max="900" />
              </FormField>
              <FormField label="Existing EMI">
                <input type="number" name="existing_emi" value={formData.existing_emi} onChange={handleChange} className="form-input" min="0" />
              </FormField>
              <FormField label="Avg Bank Balance">
                <input type="number" name="avg_bank_balance" value={formData.avg_bank_balance} onChange={handleChange} className="form-input" min="0" />
              </FormField>
              <FormField label="Bounce Count">
                <input type="number" name="bounce_count" value={formData.bounce_count} onChange={handleChange} className="form-input" min="0" />
              </FormField>
              <FormField label="Assets Value">
                <input type="number" name="assets_value" value={formData.assets_value} onChange={handleChange} className="form-input" min="0" />
              </FormField>
              <FormField label="Income Trend">
                <select name="income_trend" value={formData.income_trend} onChange={handleChange} className="form-input">
                  <option value="UP">Up</option>
                  <option value="DOWN">Down</option>
                  <option value="FLAT">Flat</option>
                </select>
              </FormField>
              <FormField label="Last Default">
                <select name="last_default" value={formData.last_default} onChange={handleChange} className="form-input">
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </FormField>
            </div>

            <div className="flex gap-3 pt-4 border-t border-[color-mix(in_oklch,var(--ink),transparent_88%)]">
              <button type="button" onClick={onCancel} disabled={isSubmitting} className="px-4 py-2 text-sm font-mono uppercase tracking-wider border border-[color-mix(in_oklch,var(--ink),transparent_70%)] rounded-[var(--radius-sm)] hover:bg-[color-mix(in_oklch,var(--paper),var(--ink)_3%)] transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting} className="flex-1 bg-[var(--brass)] text-[var(--paper)] border border-[var(--brass)] rounded-[var(--radius-sm)] px-4 py-2 text-sm font-medium hover:bg-[color-mix(in_oklch,var(--brass),var(--ink)_18%)] transition-colors disabled:opacity-50">
                {isSubmitting ? "Submitting..." : "Submit Applicant"}
              </button>
            </div>
          </form>
        </div>
      </div>
      <style jsx>{`
        .form-input {
          width: 100%;
          background-color: var(--paper);
          border: 1px solid color-mix(in oklch, var(--ink), transparent 75%);
          border-radius: var(--radius-sm);
          padding: 0.25rem 0.5rem;
          font-size: 0.875rem;
          color: var(--ink);
        }
        .form-input:focus {
          outline: none;
          border-color: var(--brass);
          box-shadow: 0 0 0 1px var(--brass);
        }
      `}</style>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[var(--ink-muted)]">{label}</label>
      {children}
    </div>
  );
}
