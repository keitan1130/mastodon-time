import datetime

def id_from_jst(dt_jst: datetime.datetime) -> int:
    """
    JST の datetime から Mastodon Snowflake ID を作成する。
    秒以下およびシーケンス部分（下位 16 ビット）はすべて 0。

    :param dt_jst: 日本標準時（JST）の datetime オブジェクト
    :return: Snowflake ID 相当の整数
    """
    # 1) タイムゾーン補正：JST -> UTC
    #    JST = UTC+9h なので 9 時間引く
    dt_utc = dt_jst - datetime.timedelta(hours=9)

    # 2) Unix エポックからのミリ秒を取得
    #    .timestamp() は秒単位の float を返すので 1000 倍して int に
    timestamp_ms = int(dt_utc.timestamp() * 1000)

    # 3) 上位 48 ビットに詰めるために左シフト
    #    下位 16 ビット（シーケンス部分）はすべて 0 になる
    snowflake_id = timestamp_ms << 16

    return snowflake_id

# 例：2025-07-25 21:01 の JST から ID を生成
dt_jst = datetime.datetime(2025, 6, 26, 22, 38)
sid = id_from_jst(dt_jst)
print("Snowflake ID:", sid)
