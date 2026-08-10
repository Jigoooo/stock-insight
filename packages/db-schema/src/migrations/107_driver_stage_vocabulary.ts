export const driverStageVocabularyMigrationSql = `
-- Widens the business-driver stage vocabulary so a bank's economics can be stated in it.
--
-- Migration 087 fixed chain_stage and affects_stage to a product P&L chain:
--
--   demand · price · mix · revenue · variable_cost · fixed_cost · margin
--   working_capital · capex · tax_interest · fcf
--
-- That is the right chain for a company that makes and sells things, and it was the
-- only kind of company the system modelled. A deposit-taking lender does not fit it.
-- Its revenue line is a SPREAD between two rates it does not set independently; its
-- largest cost is interest paid to its own funding; its growth ceiling is a regulator's
-- capital rule; and its sharpest risk is a liquidity event that converts an unrealised
-- mark into a realised loss. Calling regulatory capital headroom 'capex', or deposit
-- cost 'variable_cost', would put a false statement in a table whose entire purpose is
-- to say what drives what.
--
-- FOUR STAGES ADDED, each because a bank has it and the product chain does not:
--
--   funding              what the balance sheet costs to fund. A manufacturer's
--                        financing sits below the operating line; a bank's IS the
--                        operating line.
--   net_interest_income  the spread itself. Not 'revenue': revenue implies a price
--                        times a quantity, and this is a difference between two yields.
--   regulatory_capital   the binding constraint on growth, set outside the company.
--                        No product-chain stage is imposed by a third party this way.
--   liquidity            the ability to meet outflows without forced sale. Distinct
--                        from working_capital, which is about the operating cycle.
--
-- SAFE TO WIDEN: nothing reads these values. Grepped across apps/api and packages —
-- no code branches on any stage name; they are descriptive vocabulary for a human
-- reading the driver table. Widening a CHECK admits new rows and invalidates none.

ALTER TABLE governance.business_driver
  DROP CONSTRAINT IF EXISTS business_driver_chain_stage_check;
ALTER TABLE governance.business_driver
  ADD CONSTRAINT business_driver_chain_stage_check
  CHECK (chain_stage IN (
    'demand', 'price', 'mix', 'revenue', 'variable_cost', 'fixed_cost', 'margin',
    'working_capital', 'capex', 'tax_interest', 'fcf',
    'funding', 'net_interest_income', 'regulatory_capital', 'liquidity'
  ));

ALTER TABLE governance.business_driver
  DROP CONSTRAINT IF EXISTS business_driver_affects_stage_check;
ALTER TABLE governance.business_driver
  ADD CONSTRAINT business_driver_affects_stage_check
  CHECK (affects_stage IN (
    'demand', 'price', 'mix', 'revenue', 'variable_cost', 'fixed_cost', 'margin',
    'working_capital', 'capex', 'tax_interest', 'fcf',
    'funding', 'net_interest_income', 'regulatory_capital', 'liquidity'
  ));
`;
