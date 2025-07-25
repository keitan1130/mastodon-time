import datetime

def mastodon_timestamp_from_id(snowflake_id: int, floor_to_minute: bool = False) -> datetime.datetime:
    """
    Mastodon の Snowflake ID から作成日時を取得し、
    オプションで分以下を切り捨てる。

    :param snowflake_id: Mastodon ステータス等の ID
    :param floor_to_minute: True の場合、秒以下を 0 にして返す
    :return: UTC の datetime オブジェクト
    """
    # 下位 16 ビットを切り落とし、上位 48 ビット（ミリ秒）だけを取得
    timestamp_ms = snowflake_id >> 16
    # Unix エポックからのミリ秒を秒に変換して日時に
    dt = datetime.datetime.utcfromtimestamp(timestamp_ms / 1000.0)

    if floor_to_minute:
        # 秒とマイクロ秒を 0 にして分以下を切り捨て
        dt = dt.replace(second=0, microsecond=0)
    return dt

# 動作例
example_id = 114749937388199284
created_utc = mastodon_timestamp_from_id(example_id, floor_to_minute=True)
print("UTC (floor to minute):", created_utc)            # -> e.g. UTC: 2025-07-25 12:01:00
print("JST (floor to minute):", created_utc + datetime.timedelta(hours=9))
#      -> JST: 2025-07-25 21:01:00
