/**
 * Contract-type labels for the run panels.
 *
 * Regression: a `proposal_open_contract` message for a CALL/PUT carries no
 * `shortcode`, and the label read `contract.shortcode.split('_')` — which threw
 * "Cannot read properties of undefined (reading 'split')" and took the whole
 * tab down whenever the Rise-Fall AI bot bought a contract.
 */

import { getContractTypeName } from '../contract';

describe('getContractTypeName', () => {
    it('names a Rise/Fall contract from its shortcode suffix', () => {
        expect(getContractTypeName({ contract_type: 'CALL', shortcode: 'CALL_4000_S0P_...' })).toBe('Rise');
        expect(getContractTypeName({ contract_type: 'PUT', shortcode: 'PUT_4000_S0P_...' })).toBe('Fall');
    });

    it('names a CALL/PUT without a shortcode instead of throwing', () => {
        expect(getContractTypeName({ contract_type: 'CALL' })).toBe('Rise');
        expect(getContractTypeName({ contract_type: 'PUT', shortcode: undefined })).toBe('Fall');
    });

    it('keeps Higher/Lower distinct when the shortcode says so', () => {
        expect(getContractTypeName({ contract_type: 'CALL', shortcode: 'CALL_4000_DZH_...' })).toBe('Higher');
    });

    it('names the digit contracts', () => {
        expect(getContractTypeName({ contract_type: 'DIGITEVEN' })).toBe('Even');
        expect(getContractTypeName({ contract_type: 'DIGITODD' })).toBe('Odd');
    });
});
