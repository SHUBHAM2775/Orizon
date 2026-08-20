import os
import sys
import joblib
import pandas as pd

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from engine.ml.train_models import load_training_frame, add_proxy_loan_type
from engine.config.ml_config import JOIN_KEY

# Overriding model files path
MODEL_DIR_FIXED = os.path.join(os.path.dirname(__file__), "models")
MY_MODEL_FILES = {
    "personal": os.path.join(MODEL_DIR_FIXED, "personal_loan_xgb_v1.pkl"),
    "business": os.path.join(MODEL_DIR_FIXED, "business_loan_xgb_v1.pkl")
}

def test_models():
    print("Loading samples from the main dataset for testing...")
    df = load_training_frame()
    df = add_proxy_loan_type(df)
    
    # Take a random sample of 20 records
    df = df.sample(n=20, random_state=42).copy()
    print(f"Sampled Dataset shape: {df.shape}")
    
    for loan_type in ["personal", "business"]:
        print(f"\n--- Testing {loan_type.upper()} Model ---")
        
        if loan_type not in MY_MODEL_FILES or not os.path.exists(MY_MODEL_FILES[loan_type]):
            print(f"Model file not found for {loan_type} at {MY_MODEL_FILES.get(loan_type)}.")
            continue
            
        print(f"Loading model from {MY_MODEL_FILES[loan_type]}...")
        artifact = joblib.load(MY_MODEL_FILES[loan_type])
        model = artifact["model"]
        feature_cols = artifact["feature_columns"]
        index_to_class = artifact["index_to_class"]
        
        # Filter dataframe for this loan type
        segment_df = df[df["loan_type"] == loan_type].copy()
        
        if len(segment_df) == 0:
            print(f"No samples found for {loan_type} loan type in the unseen dataset.")
            continue
            
        print(f"Found {len(segment_df)} samples for {loan_type}.")
        
        # Prepare features
        X = segment_df[feature_cols]
        
        # Make predictions
        try:
            preds = model.predict(X)
            probs = model.predict_proba(X)
            
            # Map predictions to class labels
            pred_classes = [index_to_class[p] for p in preds]
            
            # Show results for a few samples
            print("\nSample Predictions:")
            for i in range(min(5, len(segment_df))):
                idx = segment_df.index[i]
                prospect_id = segment_df.loc[idx, JOIN_KEY] if JOIN_KEY in segment_df.columns else f"Row {idx}"
                prob_dict = {index_to_class[j]: float(probs[i][j]) for j in range(len(index_to_class))}
                prob_str = ", ".join([f"{k}: {v:.2f}" for k, v in prob_dict.items()])
                
                print(f"ID: {prospect_id} | Predicted Class: {pred_classes[i]} | Probabilities: [{prob_str}]")
                
            # Print value counts of predictions
            print("\nPrediction Distribution for this segment:")
            print(pd.Series(pred_classes).value_counts().to_string())
            
        except Exception as e:
            print(f"Error during prediction: {e}")

if __name__ == "__main__":
    test_models()
