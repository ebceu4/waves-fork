const nums = [1, 7, 9, 4]

function houseRobber(nums) {

  if (nums.length == 0)
    return 0
  if (nums.length == 1)
    return nums[0]
  if (nums.length == 2)
    return Math.max(nums[0], nums[1])

  const h = [nums[0], Math.max(nums[0], nums[1])]

  let max = 0
  for (let i = 2; i < nums.length; i++) {
    const v = Math.max(h[i - 2] + nums[i], h[i - 1])
    if (v > max) max = v
    h.push(v)
  }

  return max
}

console.log(houseRobber(nums))
