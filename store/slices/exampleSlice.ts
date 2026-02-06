import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Define the type for the slice state
interface ExampleState {
    value: number;
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
}

// Define the initial state
const initialState: ExampleState = {
    value: 0,
    status: 'idle',
};

/**
 * Example slice demonstrating Redux Toolkit patterns
 * Copy and modify this file to create new slices
 */
export const exampleSlice = createSlice({
    name: 'example',
    initialState,
    reducers: {
        // Synchronous actions
        increment: (state) => {
            state.value += 1;
        },
        decrement: (state) => {
            state.value -= 1;
        },
        incrementByAmount: (state, action: PayloadAction<number>) => {
            state.value += action.payload;
        },
        setStatus: (state, action: PayloadAction<ExampleState['status']>) => {
            state.status = action.payload;
        },
        reset: (state) => {
            state.value = initialState.value;
            state.status = initialState.status;
        },
    },
});

// Export actions for use in components
export const { increment, decrement, incrementByAmount, setStatus, reset } = exampleSlice.actions;

// Export reducer for store configuration
export default exampleSlice.reducer;
