using Calc;
using Xunit;

public class CalculatorTests
{
    [Fact]
    public void AddsTwoNumbers() => Assert.Equal(5, Calculator.Add(2, 3));

    [Fact]
    public void Divides() => Assert.Equal(2, Calculator.Divide(6, 3));

    [Fact]
    public void RejectsDivisionByZero() => Assert.Throws<ArgumentException>(() => Calculator.Divide(1, 0));
}
