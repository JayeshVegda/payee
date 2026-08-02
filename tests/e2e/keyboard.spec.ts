import { expect, test } from '@playwright/test';

test.describe('Keyboard-only Workflows', () => {
  test('navigates, parses command, autocomplete selection, and posts via keyboard', async ({ page }) => {
    // 1. Load the workstation page
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

    // 2. Test chord navigation: Alt + 3 (Review Inbox) or G then R chord
    await page.waitForTimeout(500); // Wait for hydration
    await page.keyboard.press('Escape'); // Ensure any focused input is blurred
    await page.waitForTimeout(100);
    await page.keyboard.press('g');
    await page.waitForTimeout(200);
    await page.keyboard.press('r');
    await expect(page.getByRole('heading', { name: 'Review Inbox', level: 1 })).toBeVisible();

    // Navigate back to Today page using alt+1 chord
    await page.keyboard.press('Alt+1');
    await page.waitForTimeout(150);
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

    // 3. Focus search entry using the "/" shortcut
    await page.waitForTimeout(150);
    await page.keyboard.press('/');
    const entryInput = page.locator('input[placeholder^="Payee, amount"]');
    await expect(entryInput).toBeFocused();

    // 4. Type command partially
    await entryInput.focus();
    await page.keyboard.type('ramesh 850', { delay: 50 });
    
    // Wait for the autocomplete dropdown suggestion
    const suggestionBox = page.locator('[role="listbox"]');
    await expect(suggestionBox).toBeVisible();

    // Press ArrowDown to highlight the first autocomplete option
    await page.keyboard.press('ArrowDown');
    
    // Press Tab or Enter to select the suggestion
    await page.keyboard.press('Tab');
    
    // Verify autocomplete filled correct payee name prefix
    const inputValue = await entryInput.inputValue();
    expect(inputValue.toLowerCase()).toContain('ramesh kumar');

    // 5. Press Enter to submit the command to parsed preview stage
    await page.keyboard.press('Enter');

    // Confirm that the validation preview card is active
    await expect(page.getByText('Parsed payment')).toBeVisible();
    await expect(page.locator('strong:has-text("Ramesh Kumar · ₹850")')).toBeVisible();

    // 6. Press Enter again to finalize and post the payment transaction
    await page.keyboard.press('Enter');

    // Verification: Toast notification and row entry in Today's list
    await expect(page.locator('text=Payment saved')).toBeVisible();
    const todayTable = page.locator('table');
    await expect(todayTable.getByRole('cell', { name: 'Ramesh Kumar' }).first()).toBeVisible();
  });
});
