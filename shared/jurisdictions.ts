// Official law.go.kr organization-list snapshot; do not infer parcel-level applicability.
export const jurisdictionSource =
  "https://www.law.go.kr/LSW/ordinSc.do?menuId=3&subMenuId=27&tabMenuId=139";
export const jurisdictionFetchedAt = "2026-10-08T05:28:28.210Z";
export const jurisdictions: Record<
  string,
  { org: string; municipalities: { name: string; org: string }[] }
> = {
  서울특별시: {
    org: "6110000",
    municipalities: [
      {
        name: "강남구",
        org: "3220000",
      },
      {
        name: "강동구",
        org: "3240000",
      },
      {
        name: "강북구",
        org: "3080000",
      },
      {
        name: "강서구",
        org: "3150000",
      },
      {
        name: "관악구",
        org: "3200000",
      },
      {
        name: "광진구",
        org: "3040000",
      },
      {
        name: "구로구",
        org: "3160000",
      },
      {
        name: "금천구",
        org: "3170000",
      },
      {
        name: "노원구",
        org: "3100000",
      },
      {
        name: "도봉구",
        org: "3090000",
      },
      {
        name: "동대문구",
        org: "3050000",
      },
      {
        name: "동작구",
        org: "3190000",
      },
      {
        name: "마포구",
        org: "3130000",
      },
      {
        name: "서대문구",
        org: "3120000",
      },
      {
        name: "서초구",
        org: "3210000",
      },
      {
        name: "성동구",
        org: "3030000",
      },
      {
        name: "성북구",
        org: "3070000",
      },
      {
        name: "송파구",
        org: "3230000",
      },
      {
        name: "양천구",
        org: "3140000",
      },
      {
        name: "영등포구",
        org: "3180000",
      },
      {
        name: "용산구",
        org: "3020000",
      },
      {
        name: "은평구",
        org: "3110000",
      },
      {
        name: "종로구",
        org: "3000000",
      },
      {
        name: "중구",
        org: "3010000",
      },
      {
        name: "중랑구",
        org: "3060000",
      },
    ],
  },
  부산광역시: {
    org: "6260000",
    municipalities: [
      {
        name: "강서구",
        org: "3360000",
      },
      {
        name: "금정구",
        org: "3350000",
      },
      {
        name: "기장군",
        org: "3400000",
      },
      {
        name: "남구",
        org: "3310000",
      },
      {
        name: "동구",
        org: "3270000",
      },
      {
        name: "동래구",
        org: "3300000",
      },
      {
        name: "부산진구",
        org: "3290000",
      },
      {
        name: "북구",
        org: "3320000",
      },
      {
        name: "사상구",
        org: "3390000",
      },
      {
        name: "사하구",
        org: "3340000",
      },
      {
        name: "서구",
        org: "3260000",
      },
      {
        name: "수영구",
        org: "3380000",
      },
      {
        name: "연제구",
        org: "3370000",
      },
      {
        name: "영도구",
        org: "3280000",
      },
      {
        name: "중구",
        org: "3250000",
      },
      {
        name: "해운대구",
        org: "3330000",
      },
    ],
  },
  대구광역시: {
    org: "6270000",
    municipalities: [
      {
        name: "군위군",
        org: "5141000",
      },
      {
        name: "남구",
        org: "3440000",
      },
      {
        name: "달서구",
        org: "3470000",
      },
      {
        name: "달성군",
        org: "3480000",
      },
      {
        name: "동구",
        org: "3420000",
      },
      {
        name: "북구",
        org: "3450000",
      },
      {
        name: "서구",
        org: "3430000",
      },
      {
        name: "수성구",
        org: "3460000",
      },
      {
        name: "중구",
        org: "3410000",
      },
    ],
  },
  인천광역시: {
    org: "6280000",
    municipalities: [
      {
        name: "강화군",
        org: "3570000",
      },
      {
        name: "검단구",
        org: "3565000",
      },
      {
        name: "계양구",
        org: "3550000",
      },
      {
        name: "남동구",
        org: "3530000",
      },
      {
        name: "미추홀구",
        org: "3510500",
      },
      {
        name: "부평구",
        org: "3540000",
      },
      {
        name: "서해구",
        org: "3561000",
      },
      {
        name: "연수구",
        org: "3520000",
      },
      {
        name: "영종구",
        org: "3491000",
      },
      {
        name: "옹진군",
        org: "3580000",
      },
      {
        name: "제물포구",
        org: "3501000",
      },
    ],
  },
  광주광역시: {
    org: "6290000",
    municipalities: [],
  },
  대전광역시: {
    org: "6300000",
    municipalities: [
      {
        name: "대덕구",
        org: "3680000",
      },
      {
        name: "동구",
        org: "3640000",
      },
      {
        name: "서구",
        org: "3660000",
      },
      {
        name: "유성구",
        org: "3670000",
      },
      {
        name: "중구",
        org: "3650000",
      },
    ],
  },
  울산광역시: {
    org: "6310000",
    municipalities: [
      {
        name: "남구",
        org: "3700000",
      },
      {
        name: "동구",
        org: "3710000",
      },
      {
        name: "북구",
        org: "3720000",
      },
      {
        name: "울주군",
        org: "3730000",
      },
      {
        name: "중구",
        org: "3690000",
      },
    ],
  },
  세종특별자치시: {
    org: "5690000",
    municipalities: [],
  },
  경기도: {
    org: "6410000",
    municipalities: [
      {
        name: "가평군",
        org: "4160000",
      },
      {
        name: "고양시",
        org: "3940000",
      },
      {
        name: "과천시",
        org: "3970000",
      },
      {
        name: "광명시",
        org: "3900000",
      },
      {
        name: "광주시",
        org: "5540000",
      },
      {
        name: "구리시",
        org: "3980000",
      },
      {
        name: "군포시",
        org: "4020000",
      },
      {
        name: "김포시",
        org: "4090000",
      },
      {
        name: "남양주시",
        org: "3990000",
      },
      {
        name: "동두천시",
        org: "3920000",
      },
      {
        name: "부천시",
        org: "3860000",
      },
      {
        name: "성남시",
        org: "3780000",
      },
      {
        name: "수원시",
        org: "3740000",
      },
      {
        name: "시흥시",
        org: "4010000",
      },
      {
        name: "안산시",
        org: "3930000",
      },
      {
        name: "안성시",
        org: "4080000",
      },
      {
        name: "안양시",
        org: "3830000",
      },
      {
        name: "양주시",
        org: "5590000",
      },
      {
        name: "양평군",
        org: "4170000",
      },
      {
        name: "여주시",
        org: "5700000",
      },
      {
        name: "연천군",
        org: "4140000",
      },
      {
        name: "오산시",
        org: "4000000",
      },
      {
        name: "용인시",
        org: "4050000",
      },
      {
        name: "의왕시",
        org: "4030000",
      },
      {
        name: "의정부시",
        org: "3820000",
      },
      {
        name: "이천시",
        org: "4070000",
      },
      {
        name: "파주시",
        org: "4060000",
      },
      {
        name: "평택시",
        org: "3910000",
      },
      {
        name: "포천시",
        org: "5600000",
      },
      {
        name: "하남시",
        org: "4040000",
      },
      {
        name: "화성시",
        org: "5530000",
      },
    ],
  },
  강원특별자치도: {
    org: "6530000",
    municipalities: [
      {
        name: "강릉시",
        org: "4201000",
      },
      {
        name: "고성군",
        org: "4341000",
      },
      {
        name: "동해시",
        org: "4211000",
      },
      {
        name: "삼척시",
        org: "4241000",
      },
      {
        name: "속초시",
        org: "4231000",
      },
      {
        name: "양구군",
        org: "4321000",
      },
      {
        name: "양양군",
        org: "4351000",
      },
      {
        name: "영월군",
        org: "4271000",
      },
      {
        name: "원주시",
        org: "4191000",
      },
      {
        name: "인제군",
        org: "4331000",
      },
      {
        name: "정선군",
        org: "4291000",
      },
      {
        name: "철원군",
        org: "4301000",
      },
      {
        name: "춘천시",
        org: "4181000",
      },
      {
        name: "태백시",
        org: "4221000",
      },
      {
        name: "평창군",
        org: "4281000",
      },
      {
        name: "홍천군",
        org: "4251000",
      },
      {
        name: "화천군",
        org: "4311000",
      },
      {
        name: "횡성군",
        org: "4261000",
      },
    ],
  },
  충청북도: {
    org: "6430000",
    municipalities: [
      {
        name: "괴산군",
        org: "4460000",
      },
      {
        name: "단양군",
        org: "4480000",
      },
      {
        name: "보은군",
        org: "4420000",
      },
      {
        name: "영동군",
        org: "4440000",
      },
      {
        name: "옥천군",
        org: "4430000",
      },
      {
        name: "음성군",
        org: "4470000",
      },
      {
        name: "제천시",
        org: "4400000",
      },
      {
        name: "증평군",
        org: "5570000",
      },
      {
        name: "진천군",
        org: "4450000",
      },
      {
        name: "청주시",
        org: "5710000",
      },
      {
        name: "충주시",
        org: "4390000",
      },
    ],
  },
  충청남도: {
    org: "6440000",
    municipalities: [
      {
        name: "계룡시",
        org: "5580000",
      },
      {
        name: "공주시",
        org: "4500000",
      },
      {
        name: "금산군",
        org: "4550000",
      },
      {
        name: "논산시",
        org: "4540000",
      },
      {
        name: "당진시",
        org: "5680000",
      },
      {
        name: "보령시",
        org: "4510000",
      },
      {
        name: "부여군",
        org: "4570000",
      },
      {
        name: "서산시",
        org: "4530000",
      },
      {
        name: "서천군",
        org: "4580000",
      },
      {
        name: "아산시",
        org: "4520000",
      },
      {
        name: "예산군",
        org: "4610000",
      },
      {
        name: "천안시",
        org: "4490000",
      },
      {
        name: "청양군",
        org: "4590000",
      },
      {
        name: "태안군",
        org: "4620000",
      },
      {
        name: "홍성군",
        org: "4600000",
      },
    ],
  },
  전북특별자치도: {
    org: "6540000",
    municipalities: [
      {
        name: "고창군",
        org: "4781000",
      },
      {
        name: "군산시",
        org: "4671000",
      },
      {
        name: "김제시",
        org: "4711000",
      },
      {
        name: "남원시",
        org: "4701000",
      },
      {
        name: "무주군",
        org: "4741000",
      },
      {
        name: "부안군",
        org: "4791000",
      },
      {
        name: "순창군",
        org: "4771000",
      },
      {
        name: "완주군",
        org: "4721000",
      },
      {
        name: "익산시",
        org: "4681000",
      },
      {
        name: "임실군",
        org: "4761000",
      },
      {
        name: "장수군",
        org: "4751000",
      },
      {
        name: "전주시",
        org: "4641000",
      },
      {
        name: "정읍시",
        org: "4691000",
      },
      {
        name: "진안군",
        org: "4731000",
      },
    ],
  },
  전라남도: {
    org: "6460000",
    municipalities: [],
  },
  경상북도: {
    org: "6470000",
    municipalities: [
      {
        name: "경산시",
        org: "5130000",
      },
      {
        name: "경주시",
        org: "5050000",
      },
      {
        name: "고령군",
        org: "5200000",
      },
      {
        name: "구미시",
        org: "5080000",
      },
      {
        name: "김천시",
        org: "5060000",
      },
      {
        name: "문경시",
        org: "5120000",
      },
      {
        name: "봉화군",
        org: "5240000",
      },
      {
        name: "상주시",
        org: "5110000",
      },
      {
        name: "성주군",
        org: "5210000",
      },
      {
        name: "안동시",
        org: "5070000",
      },
      {
        name: "영덕군",
        org: "5180000",
      },
      {
        name: "영양군",
        org: "5170000",
      },
      {
        name: "영주시",
        org: "5090000",
      },
      {
        name: "영천시",
        org: "5100000",
      },
      {
        name: "예천군",
        org: "5230000",
      },
      {
        name: "울릉군",
        org: "5260000",
      },
      {
        name: "울진군",
        org: "5250000",
      },
      {
        name: "의성군",
        org: "5150000",
      },
      {
        name: "청도군",
        org: "5190000",
      },
      {
        name: "청송군",
        org: "5160000",
      },
      {
        name: "칠곡군",
        org: "5220000",
      },
      {
        name: "포항시",
        org: "5020000",
      },
    ],
  },
  경상남도: {
    org: "6480000",
    municipalities: [
      {
        name: "거제시",
        org: "5370000",
      },
      {
        name: "거창군",
        org: "5470000",
      },
      {
        name: "고성군",
        org: "5420000",
      },
      {
        name: "김해시",
        org: "5350000",
      },
      {
        name: "남해군",
        org: "5430000",
      },
      {
        name: "밀양시",
        org: "5360000",
      },
      {
        name: "사천시",
        org: "5340000",
      },
      {
        name: "산청군",
        org: "5450000",
      },
      {
        name: "양산시",
        org: "5380000",
      },
      {
        name: "의령군",
        org: "5390000",
      },
      {
        name: "진주시",
        org: "5310000",
      },
      {
        name: "창녕군",
        org: "5410000",
      },
      {
        name: "창원시",
        org: "5670000",
      },
      {
        name: "통영시",
        org: "5330000",
      },
      {
        name: "하동군",
        org: "5440000",
      },
      {
        name: "함안군",
        org: "5400000",
      },
      {
        name: "함양군",
        org: "5460000",
      },
      {
        name: "합천군",
        org: "5480000",
      },
    ],
  },
  제주특별자치도: {
    org: "6500000",
    municipalities: [
      {
        name: "서귀포시",
        org: "6520000",
      },
      {
        name: "제주시",
        org: "6510000",
      },
    ],
  },
};

// Match only a known authority; unknown names remain candidates requiring review.
export function ordinanceScope(
  title: string,
  region: string,
  municipality: string,
) {
  const compact = (v: string) => v.replace(/\s/g, "");
  const name = compact(title),
    province = compact(region),
    local = compact(municipality);
  const candidates = [
    ...new Set([
      ...(jurisdictions[region]?.municipalities.map((m) => m.name) || []),
      ...(municipality ? [municipality] : []),
    ]),
  ].sort((a, b) => b.length - a.length);
  const city = candidates.find(
    (c) =>
      name.startsWith(province + compact(c)) || name.startsWith(compact(c)),
  );
  if (city) return compact(city) === local ? "municipality" : "other";
  return name.startsWith(province) ? "province" : "unresolved";
}
