using System;

namespace Calc;

public static class Calculator
{
    public static int Add(int a, int b) => a + b;

    public static double Divide(double a, double b)
    {
        if (b == 0) throw new ArgumentException("division by zero", nameof(b));
        return a / b;
    }
}
